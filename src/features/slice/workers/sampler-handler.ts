import type { Readable } from "zarrita";
import { FetchStore, withByteCaching } from "zarrita";
import type { AnnotationVolume } from "../models/annotation-level.model";
import {
  openAnnotationVolume,
  readAnnotationChunk
} from "../api/annotation-volume.api";
import type { SampleChunkRequest } from "../models/sample-plan.model";
import type {
  InboundSamplerMessage,
  OutboundSamplerMessage
} from "../models/sampler-message.model";

/** Total bytes of decoded chunks to keep cached before evicting the oldest. */
const MAXIMUM_CACHED_CHUNK_BYTES = 64 * 1024 * 1024;

/** Chunk fetches to run concurrently. */
const MAXIMUM_CONCURRENT_CHUNK_REQUESTS = 8;

/** Chunks buffered before a flush is forced, even if the interval hasn't elapsed. */
const FLUSH_CHUNK_THRESHOLD = 8;

/** Milliseconds buffered before a flush is forced, even under the chunk threshold. */
const FLUSH_INTERVAL_MILLISECONDS = 100;

/** Builds the store a worker reads chunks from, given the volume's URL. */
export type SamplerStoreFactory = (url: string) => Readable;

/** A worker's callback to send a message back to the main thread. */
export type SamplerPost = (
  message: OutboundSamplerMessage,
  transfer?: Transferable[]
) => void;

/** A sampler handler's message-processing entry point. */
export interface SamplerHandler {
  handleMessage: (message: InboundSamplerMessage) => Promise<void>;
}

/** An in-progress stream's accumulated, not-yet-flushed sample contributions. */
interface StreamBuffer {
  sampleIndices: number[];
  annotationValues: number[];
  colors: number[];
  chunkCount: number;
}

/** An in-progress stream's cancellation and flush-coalescing state. */
interface StreamState {
  generation: number;
  controller: AbortController;
  buffer: StreamBuffer;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Default store factory for the real worker: a `FetchStore` with a byte
 * cache scoped to `zarr.json` metadata (decoded chunks are cached separately,
 * by {@link createChunkCache}).
 * @param url Annotation volume URL to open.
 */
function defaultStoreFactory(url: string): Readable {
  return withByteCaching(new FetchStore(url), {
    keyFor: path => (path.endsWith("/zarr.json") ? path : undefined)
  });
}

/**
 * Create a message handler for one annotation-sampler worker. Pure aside
 * from its own private state, so it's testable without a real `Worker` -
 * drive it directly with a recording `post` callback.
 * @param post Callback to send a message back to the main thread.
 * @param storeFactory Builds the zarr store a volume is opened from. Defaults
 *   to a `FetchStore`; pass a `Map`-backed store factory in tests.
 * @param maximumCachedChunkBytes Total bytes of decoded chunks to keep
 *   cached before evicting the oldest. Defaults to 64 MiB; overridable in
 *   tests to exercise eviction without allocating real-sized chunks.
 */
export function createSamplerHandler(
  post: SamplerPost,
  storeFactory: SamplerStoreFactory = defaultStoreFactory,
  maximumCachedChunkBytes: number = MAXIMUM_CACHED_CHUNK_BYTES
): SamplerHandler {
  let volume: AnnotationVolume | null = null;
  // Tracks the in-flight `open`, so a `sample` that arrives before it
  // resolves can wait on it instead of reading `volume` while it's still
  // null - the worker's `onmessage` dispatch doesn't await `handleMessage`,
  // so an `open` and a following `sample` can otherwise overlap.
  let openPromise: Promise<void> | null = null;
  let colors = new Map<number, number>();
  const chunkCache = createChunkCache(maximumCachedChunkBytes);
  const streams = new Map<string, StreamState>();

  async function handleMessage(message: InboundSamplerMessage): Promise<void> {
    switch (message.type) {
      case "open":
        return handleOpen(message.url);
      case "colors":
        colors = message.colors;
        return;
      case "sample":
        return handleSample(message);
      case "cancel":
        cancelStream(message.streamId);
        return;
      case "close":
        for (const streamId of streams.keys()) cancelStream(streamId);
        volume = null;
        chunkCache.clear();
        return;
    }
  }

  async function handleOpen(url: string): Promise<void> {
    for (const streamId of streams.keys()) cancelStream(streamId);
    chunkCache.clear();
    volume = null;
    openPromise = (async () => {
      volume = await openAnnotationVolume(storeFactory(url), url);
    })();
    await openPromise;
  }

  async function handleSample(message: {
    streamId: string;
    generation: number;
    levelIndex: number;
    requests: SampleChunkRequest[];
  }): Promise<void> {
    const { streamId, generation, levelIndex, requests } = message;

    cancelStream(streamId);
    const controller = new AbortController();
    const state: StreamState = {
      generation,
      controller,
      buffer: {
        sampleIndices: [],
        annotationValues: [],
        colors: [],
        chunkCount: 0
      },
      flushTimer: null
    };
    streams.set(streamId, state);

    // Registering the stream above stays synchronous with dispatch (so a
    // "cancel"/"close" for it still lands correctly), and this only awaits
    // when `volume` is genuinely still unresolved - `handleOpen` sets
    // `volume = null` synchronously before its own await, so that's exactly
    // "an open is in flight". Gating on it (rather than unconditionally
    // awaiting `openPromise`) keeps the already-open case perfectly
    // synchronous, matching every existing caller; without this, a `sample`
    // dispatched right after an `open` (e.g. a freshly built worker pool, as
    // happens when selecting a probe with none previously selected) reads
    // `volume` as still null, reports every chunk as background, and the
    // stream is marked complete - a blank slice that never retries.
    if (volume === null && openPromise) await openPromise;

    const level = volume?.levels[levelIndex] ?? null;

    await forEachConcurrent(
      requests,
      MAXIMUM_CONCURRENT_CHUNK_REQUESTS,
      async request => {
        if (streams.get(streamId) !== state) return;

        if (!level) {
          recordChunk(streamId, state, request, null);
          return;
        }

        const cacheKey = chunkKey(level.path, request.chunkCoordinates);
        const cached = chunkCache.get(cacheKey);
        if (cached) {
          recordChunk(streamId, state, request, cached);
          return;
        }

        try {
          const data = await readAnnotationChunk(
            level,
            request.chunkCoordinates,
            controller.signal
          );
          if (streams.get(streamId) !== state) return;
          chunkCache.set(cacheKey, data);
          recordChunk(streamId, state, request, data);
        } catch (error) {
          if (isAbortError(error)) return;
          // A transient fetch failure still counts toward progress, as
          // background - the stream must reach 100% rather than hang.
          if (streams.get(streamId) === state) {
            recordChunk(streamId, state, request, null);
          }
        }
      }
    );

    if (streams.get(streamId) === state) flushStream(streamId, state);
  }

  function recordChunk(
    streamId: string,
    state: StreamState,
    request: SampleChunkRequest,
    chunkData: Uint32Array | null
  ): void {
    if (chunkData) {
      const { sampleIndices, voxelOffsets } = request;
      for (let index = 0; index < sampleIndices.length; index++) {
        const value = chunkData[voxelOffsets[index]!];
        if (!value) continue;
        state.buffer.sampleIndices.push(sampleIndices[index]!);
        state.buffer.annotationValues.push(value);
        state.buffer.colors.push(colors.get(value) ?? 0);
      }
    }
    state.buffer.chunkCount += 1;

    if (state.buffer.chunkCount % FLUSH_CHUNK_THRESHOLD === 0) {
      flushStream(streamId, state);
      return;
    }
    if (!state.flushTimer) {
      state.flushTimer = setTimeout(
        () => flushStream(streamId, state),
        FLUSH_INTERVAL_MILLISECONDS
      );
    }
  }

  function flushStream(streamId: string, state: StreamState): void {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    if (streams.get(streamId) !== state) return;
    if (state.buffer.chunkCount === 0) return;

    const {
      sampleIndices,
      annotationValues,
      colors: bufferedColors,
      chunkCount
    } = state.buffer;
    const sampleIndicesArray = Int32Array.from(sampleIndices);
    const annotationValuesArray = Uint32Array.from(annotationValues);
    const colorsArray = Uint32Array.from(bufferedColors);

    state.buffer = {
      sampleIndices: [],
      annotationValues: [],
      colors: [],
      chunkCount: 0
    };

    post(
      {
        type: "sampled",
        streamId,
        generation: state.generation,
        chunkCount,
        sampleIndices: sampleIndicesArray,
        annotationValues: annotationValuesArray,
        colors: colorsArray
      },
      [
        sampleIndicesArray.buffer,
        annotationValuesArray.buffer,
        colorsArray.buffer
      ]
    );
  }

  function cancelStream(streamId: string): void {
    const state = streams.get(streamId);
    if (!state) return;
    state.controller.abort();
    if (state.flushTimer) clearTimeout(state.flushTimer);
    streams.delete(streamId);
  }

  return { handleMessage };
}

/** A decoded-chunk LRU, bounded by total bytes, evicting least-recently-used. */
interface ChunkCache {
  get: (key: string) => Uint32Array | null;
  set: (key: string, data: Uint32Array) => void;
  clear: () => void;
}

/**
 * Create an empty {@link ChunkCache}.
 * @param maximumBytes Total bytes of decoded chunks to keep before evicting the oldest.
 */
function createChunkCache(maximumBytes: number): ChunkCache {
  const entries = new Map<string, Uint32Array>();
  let totalBytes = 0;

  return {
    get(key) {
      const data = entries.get(key);
      if (!data) return null;
      // Bump recency: re-insert at the end (Maps iterate in insertion order).
      entries.delete(key);
      entries.set(key, data);
      return data;
    },
    set(key, data) {
      entries.set(key, data);
      totalBytes += data.byteLength;
      while (totalBytes > maximumBytes && entries.size > 1) {
        const oldestKey = entries.keys().next().value!;
        const oldest = entries.get(oldestKey)!;
        entries.delete(oldestKey);
        totalBytes -= oldest.byteLength;
      }
    },
    clear() {
      entries.clear();
      totalBytes = 0;
    }
  };
}

/**
 * Cache key for a decoded chunk, scoped to its multiscale level so the same
 * chunk coordinates at different levels never collide.
 * @param levelPath Multiscale dataset path, e.g. `s0`.
 * @param chunkCoordinates Chunk grid coordinates as [ap, dv, ml].
 */
function chunkKey(
  levelPath: string,
  chunkCoordinates: [number, number, number]
): string {
  return `${levelPath}/${chunkCoordinates.join("/")}`;
}

/**
 * Run an async function over a list with bounded concurrency.
 * @param items Items to process.
 * @param concurrency Maximum number of items in flight at once.
 * @param fn Async function to run per item.
 */
async function forEachConcurrent<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Is the given error an `AbortError` from a cancelled fetch or zarr read.
 * @param error Error to check.
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
