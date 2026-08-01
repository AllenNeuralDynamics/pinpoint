import { describe, expect, it, vi } from "vitest";
import { makeAnnotationVolumeStore } from "@/test/fixtures";
import type { SampleChunkRequest } from "../models/sample-plan.model";
import type { OutboundSamplerMessage } from "../models/sampler-message.model";
import { createSamplerHandler } from "./sampler-handler";

function makeRequest(
  chunkCoordinates: [number, number, number],
  sampleIndices: number[],
  voxelOffsets: number[]
): SampleChunkRequest {
  return {
    chunkCoordinates,
    sampleIndices: Int32Array.from(sampleIndices),
    voxelOffsets: Int32Array.from(voxelOffsets)
  };
}

/** Build a handler wired to an in-memory store, and a recorder of its posts. */
function makeHandler(
  store: Map<string, Uint8Array>,
  maximumCachedChunkBytes?: number
) {
  const posted: OutboundSamplerMessage[] = [];
  const handler = createSamplerHandler(
    message => posted.push(message),
    () => store,
    maximumCachedChunkBytes
  );
  return { handler, posted };
}

/** Flatten every posted "sampled" message's arrays for one stream into one map. */
function collectSampled(
  posted: OutboundSamplerMessage[],
  streamId: string
): Map<number, { value: number; color: number }> {
  const result = new Map<number, { value: number; color: number }>();
  for (const message of posted) {
    if (message.streamId !== streamId) continue;
    for (let i = 0; i < message.sampleIndices.length; i++) {
      result.set(message.sampleIndices[i]!, {
        value: message.annotationValues[i]!,
        color: message.colors[i]!
      });
    }
  }
  return result;
}

describe("createSamplerHandler", () => {
  it("samples a chunk and reports non-background values with their colors", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([0, 42, 0, 0, 0, 0, 0, 0]) }
    });
    const { handler, posted } = makeHandler(store);

    await handler.handleMessage({ type: "open", url: "http://example.com" });
    await handler.handleMessage({
      type: "colors",
      colors: new Map([[42, 0xffcc8811]])
    });
    await handler.handleMessage({
      type: "sample",
      streamId: "a",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [10], [1])]
    });

    const samples = collectSampled(posted, "a");
    expect(samples.get(10)).toEqual({ value: 42, color: 0xffcc8811 });
  });

  it("waits for an in-flight open before sampling, e.g. a freshly built worker pool", async () => {
    // `handleMessage` is never awaited by the worker's real `onmessage`
    // (`annotation-sampler.worker.ts`), so an "open" and a following
    // "sample" can be in flight at once - most notably right after a fresh
    // pool is built, which is exactly what happens when a probe is selected
    // with none previously selected. Not awaiting "open" here reproduces
    // that race; every other test in this file awaits it, which is why none
    // of them would have caught a handler that read `volume` too early.
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([0, 42, 0, 0, 0, 0, 0, 0]) }
    });
    const { handler, posted } = makeHandler(store);

    void handler.handleMessage({ type: "open", url: "http://example.com" });
    await handler.handleMessage({
      type: "sample",
      streamId: "a",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [10], [1])]
    });

    const samples = collectSampled(posted, "a");
    expect(samples.get(10)).toEqual({ value: 42, color: 0 });
  });

  it("omits background samples from the flush entirely", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2]
    });
    const { handler, posted } = makeHandler(store);

    await handler.handleMessage({ type: "open", url: "http://example.com" });
    await handler.handleMessage({
      type: "sample",
      streamId: "a",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([1, 1, 1], [0, 1], [0, 1])]
    });

    expect(collectSampled(posted, "a").size).toBe(0);
  });

  it("serves a repeated chunk request from the cache with no second decode", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([9, 0, 0, 0, 0, 0, 0, 0]) }
    });
    const getChunkSpy = vi.fn();
    const originalGet = store.get.bind(store);
    // Spy on the store's chunk byte reads (not the decoded-chunk path) to
    // confirm the second sample never re-fetches the chunk's compressed bytes.
    vi.spyOn(store, "get").mockImplementation(key => {
      if (typeof key === "string" && key.includes("/c/")) getChunkSpy(key);
      return originalGet(key);
    });
    const { handler, posted } = makeHandler(store);

    await handler.handleMessage({ type: "open", url: "http://example.com" });
    await handler.handleMessage({
      type: "sample",
      streamId: "a",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [0], [0])]
    });
    await handler.handleMessage({
      type: "sample",
      streamId: "b",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [0], [0])]
    });

    expect(getChunkSpy).toHaveBeenCalledTimes(1);
    expect(collectSampled(posted, "a").get(0)?.value).toBe(9);
    expect(collectSampled(posted, "b").get(0)?.value).toBe(9);
  });

  it("drops a superseded generation's flush", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 0, 0, 0, 0, 0, 0, 0]) }
    });
    const { handler, posted } = makeHandler(store);

    await handler.handleMessage({ type: "open", url: "http://example.com" });

    // Fire two "sample" calls for the same stream back to back; the second
    // supersedes the first before it can flush.
    const first = handler.handleMessage({
      type: "sample",
      streamId: "a",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [0], [0])]
    });
    const second = handler.handleMessage({
      type: "sample",
      streamId: "a",
      generation: 1,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [0], [0])]
    });
    await Promise.all([first, second]);

    const generationsSeen = new Set(
      posted.filter(m => m.streamId === "a").map(m => m.generation)
    );
    expect(generationsSeen).toEqual(new Set([1]));
  });

  it("stops in-flight work for a stream when it's cancelled", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 0, 0, 0, 0, 0, 0, 0]) }
    });
    const { handler, posted } = makeHandler(store);

    await handler.handleMessage({ type: "open", url: "http://example.com" });
    const sample = handler.handleMessage({
      type: "sample",
      streamId: "a",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [0], [0])]
    });
    await handler.handleMessage({ type: "cancel", streamId: "a" });
    await sample;

    expect(posted.filter(m => m.streamId === "a")).toHaveLength(0);
  });

  it("reopening the volume clears the chunk cache", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 0, 0, 0, 0, 0, 0, 0]) }
    });
    const getChunkSpy = vi.fn();
    const originalGet = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(key => {
      if (typeof key === "string" && key.includes("/c/")) getChunkSpy(key);
      return originalGet(key);
    });
    const { handler } = makeHandler(store);

    await handler.handleMessage({ type: "open", url: "http://example.com" });
    await handler.handleMessage({
      type: "sample",
      streamId: "a",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [0], [0])]
    });
    await handler.handleMessage({ type: "open", url: "http://example.com" });
    await handler.handleMessage({
      type: "sample",
      streamId: "b",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [0], [0])]
    });

    expect(getChunkSpy).toHaveBeenCalledTimes(2);
  });

  it("close cancels every stream and clears the cache", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 0, 0, 0, 0, 0, 0, 0]) }
    });
    const getChunkSpy = vi.fn();
    const originalGet = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(key => {
      if (typeof key === "string" && key.includes("/c/")) getChunkSpy(key);
      return originalGet(key);
    });
    const { handler, posted } = makeHandler(store);

    await handler.handleMessage({ type: "open", url: "http://example.com" });
    const sample = handler.handleMessage({
      type: "sample",
      streamId: "a",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [0], [0])]
    });
    await handler.handleMessage({ type: "close" });
    await sample;

    // Cancelled before it could flush.
    expect(posted.filter(m => m.streamId === "a")).toHaveLength(0);

    // The cache was cleared along with the volume, so sampling again after
    // close re-decodes the chunk from scratch rather than reading the (now
    // stale) cached entry.
    await handler.handleMessage({ type: "open", url: "http://example.com" });
    await handler.handleMessage({
      type: "sample",
      streamId: "b",
      generation: 0,
      levelIndex: 0,
      requests: [makeRequest([0, 0, 0], [0], [0])]
    });
    expect(getChunkSpy).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest cached chunk once the byte budget is exceeded", async () => {
    // Four chunks of 2^3 uint32 voxels (32 bytes each) fit comfortably
    // within any real budget, but a 96-byte cap forces eviction after the
    // third chunk - the first chunk's bytes must then be decoded again.
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [8, 8, 8],
      chunkShapeVoxels: [2, 2, 2],
      chunks: {
        "0/0/0": Uint32Array.from({ length: 8 }, () => 1),
        "0/0/1": Uint32Array.from({ length: 8 }, () => 2),
        "0/0/2": Uint32Array.from({ length: 8 }, () => 3),
        "0/0/3": Uint32Array.from({ length: 8 }, () => 4)
      }
    });
    const getChunkSpy = vi.fn();
    const originalGet = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(key => {
      if (typeof key === "string" && key.includes("/c/")) getChunkSpy(key);
      return originalGet(key);
    });
    const { handler } = makeHandler(store, 96);

    await handler.handleMessage({ type: "open", url: "http://example.com" });
    for (const [index, chunkCoordinates] of [
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 2],
      [0, 0, 3],
      [0, 0, 0]
    ].entries() as IterableIterator<[number, [number, number, number]]>) {
      await handler.handleMessage({
        type: "sample",
        streamId: `stream-${index}`,
        generation: 0,
        levelIndex: 0,
        requests: [makeRequest(chunkCoordinates, [0], [0])]
      });
    }

    // 5 fetches total: the first chunk (0,0,0) was evicted by the time the
    // fifth request re-reads it, so it decodes twice; the rest decode once.
    expect(getChunkSpy).toHaveBeenCalledTimes(5);
  });

  it("swallows an AbortError from a cancelled read without posting or throwing", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 0, 0, 0, 0, 0, 0, 0]) }
    });
    const { handler, posted } = makeHandler(store);

    // Let "open" succeed (it only reads metadata), then make chunk reads
    // fail as an AbortError - the shape a real cancelled fetch takes.
    await handler.handleMessage({ type: "open", url: "http://example.com" });
    const originalGet = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(key => {
      if (typeof key === "string" && key.includes("/c/")) {
        throw new DOMException("aborted", "AbortError");
      }
      return originalGet(key);
    });

    await expect(
      handler.handleMessage({
        type: "sample",
        streamId: "a",
        generation: 0,
        levelIndex: 0,
        requests: [makeRequest([0, 0, 0], [0], [0])]
      })
    ).resolves.toBeUndefined();

    expect(posted.filter(m => m.streamId === "a")).toHaveLength(0);
  });
});
