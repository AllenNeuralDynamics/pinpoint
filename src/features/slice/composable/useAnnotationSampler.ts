import { onScopeDispose, type Ref, shallowRef, watch } from "vue";
import { createSharedComposable, watchDebounced } from "@vueuse/core";
import type { Readable } from "zarrita";
import type { Manifest, TerminologyRow } from "@/features/atlas";
import { getAnnotationVolumeUrl } from "@/features/atlas";
import { createAnnotationMetadataStore } from "../api/annotation-store.api";
import { openAnnotationVolume } from "../api/annotation-volume.api";
import { getWorkerCount, groupRequestsByShard } from "../api/chunk-shard.api";
import { createSampleResult } from "../api/sample-result.api";
import {
  planSamples,
  selectAnnotationLevelIndex
} from "../api/sample-plan.api";
import { buildStructureColors } from "../api/structure-colors.api";
import type { AnnotationVolume } from "../models/annotation-level.model";
import type { SampleGeometry } from "../models/sample-geometry.model";
import type { SampleResult } from "../models/sample-result.model";
import type {
  InboundSamplerMessage,
  SampledMessage
} from "../models/sampler-message.model";

/** Milliseconds a geometry change is debounced before replanning, capped by an equal `maxWait`. */
const REPLAN_INTERVAL_MILLISECONDS = 1000 / 60;

/** Builds one sampler worker. Overridable in tests to avoid a real `Worker`. */
export type SamplerWorkerFactory = () => SamplerWorker;

/** Builds the zarr store the main thread reads volume metadata from. */
export type MetadataStoreFactory = (url: string) => Readable;

/** The subset of `Worker` the composable depends on. */
export interface SamplerWorker {
  postMessage(message: InboundSamplerMessage): void;
  onmessage: ((event: MessageEvent<SampledMessage>) => void) | null;
  terminate(): void;
}

/** One subscribed stream's reactive output. */
export interface AnnotationSampleStream {
  result: Readonly<Ref<SampleResult | null>>;
  isLoading: Readonly<Ref<boolean>>;
}

/**
 * Default factory for the real annotation-sampler worker, loaded via a
 * standard `new URL(..., import.meta.url)` + module worker (works under
 * Vite without any extra type declarations).
 */
function defaultWorkerFactory(): SamplerWorker {
  return new Worker(
    new URL("../workers/annotation-sampler.worker.ts", import.meta.url),
    {
      type: "module"
    }
  );
}

/**
 * A chunk-sharded pool of annotation-sampler workers, shared by every
 * `createStream` caller across the app via `createSharedComposable`.
 * @param options Reactive manifest and terminology inputs.
 * @param workerFactory Builds one pool worker. Overridable in tests.
 * @param metadataStoreFactory Builds the zarr store the main thread reads
 *   volume metadata from. Overridable in tests to avoid a real fetch.
 */
export const useAnnotationSampler = createSharedComposable(
  function useAnnotationSampler(
    options: {
      manifest: Ref<Manifest | null>;
      terminologyRows: Ref<TerminologyRow[]>;
    },
    workerFactory: SamplerWorkerFactory = defaultWorkerFactory,
    metadataStoreFactory: MetadataStoreFactory = createAnnotationMetadataStore
  ): {
    createStream: (
      geometry: Ref<SampleGeometry | null>
    ) => AnnotationSampleStream;
  } {
    const workerCount = getWorkerCount(
      typeof navigator === "undefined" ? 0 : navigator.hardwareConcurrency
    );
    const workers = Array.from({ length: workerCount }, workerFactory);

    let streamCount = 0;
    let nextStreamId = 0;
    let volume: AnnotationVolume | null = null;
    const streamGenerations = new Map<string, number>();
    const streamRequestCounts = new Map<
      string,
      { total: number; done: number }
    >();
    const streamCallbacks = new Map<
      string,
      (message: SampledMessage) => void
    >();
    // Re-run each stream's last plan attempt once the volume (re)opens, since
    // a stream's geometry may already have settled before the volume's
    // metadata resolved (both are async, independently of each other).
    const streamReplans = new Map<string, () => void>();

    for (const worker of workers) {
      worker.onmessage = event => {
        streamCallbacks.get(event.data.streamId)?.(event.data);
      };
    }

    function broadcast(message: InboundSamplerMessage): void {
      for (const worker of workers) worker.postMessage(message);
    }

    watch(
      () =>
        options.manifest.value
          ? getAnnotationVolumeUrl(options.manifest.value)
          : null,
      async url => {
        volume = null;
        if (!url) return;

        broadcast({ type: "open", url });
        // Metadata-only: opening a volume reads a handful of small zarr.json
        // files, never chunk bytes. The main thread needs the real level
        // shapes/scales to plan and shard correctly; each worker separately
        // opens the same URL for its own chunk-decoding store.
        volume = await openAnnotationVolume(metadataStoreFactory(url), url);
        for (const replan of streamReplans.values()) replan();
      },
      { immediate: true }
    );

    watch(
      options.terminologyRows,
      rows => broadcast({ type: "colors", colors: buildStructureColors(rows) }),
      { immediate: true }
    );

    /**
     * Subscribe a stream: plans and samples the given geometry whenever it
     * changes, reassembling each worker's contribution into one result.
     * @param geometry Geometry to keep sampled. Null clears the result.
     */
    function createStream(
      geometry: Ref<SampleGeometry | null>
    ): AnnotationSampleStream {
      const streamId = `stream-${nextStreamId++}`;
      streamCount += 1;

      const result = shallowRef<SampleResult | null>(null);
      const isLoading = shallowRef(false);

      streamCallbacks.set(streamId, message => {
        if (streamGenerations.get(streamId) !== message.generation) return;
        const current = result.value;
        if (!current) return;

        applySampledMessage(current, message);

        const counts = streamRequestCounts.get(streamId);
        if (counts) {
          counts.done += 1;
          if (counts.done >= counts.total) isLoading.value = false;
        }
        result.value = { ...current };
      });

      function planAndSample(value: SampleGeometry | null): void {
        if (!value) {
          result.value = null;
          isLoading.value = false;
          return;
        }
        // The volume may not have opened yet (both are async, independently);
        // `streamReplans` re-invokes this once it does, so just wait.
        if (!volume || volume.levels.length === 0) return;

        const generation = (streamGenerations.get(streamId) ?? 0) + 1;
        streamGenerations.set(streamId, generation);

        const levelIndex = selectAnnotationLevelIndex(volume, value);
        const plan = planSamples(value, volume.levels[levelIndex]!, levelIndex);
        const shardGroups = groupRequestsByShard(plan, workerCount);
        const nonEmptyGroups = shardGroups.filter(group => group.length > 0);

        result.value = createSampleResult(
          plan.sampleCount,
          value.kind === "plane"
        );
        result.value.totalChunkCount = plan.chunkRequests.length;
        streamRequestCounts.set(streamId, {
          total: nonEmptyGroups.length,
          done: 0
        });
        isLoading.value = nonEmptyGroups.length > 0;

        shardGroups.forEach((requests, workerIndex) => {
          if (requests.length === 0) return;
          workers[workerIndex]!.postMessage({
            type: "sample",
            streamId,
            generation,
            levelIndex,
            requests
          });
        });
      }

      streamReplans.set(streamId, () => planAndSample(geometry.value));

      watchDebounced(geometry, planAndSample, {
        debounce: REPLAN_INTERVAL_MILLISECONDS,
        maxWait: REPLAN_INTERVAL_MILLISECONDS,
        immediate: true
      });

      onScopeDispose(() => {
        broadcast({ type: "cancel", streamId });
        streamCallbacks.delete(streamId);
        streamGenerations.delete(streamId);
        streamRequestCounts.delete(streamId);
        streamReplans.delete(streamId);
        streamCount -= 1;
        if (streamCount === 0) {
          for (const worker of workers) worker.terminate();
        }
      });

      return { result, isLoading };
    }

    return { createStream };
  }
);

/**
 * Apply one worker's sampled flush to a result in place.
 * @param result Result to mutate.
 * @param message Flush to apply.
 */
function applySampledMessage(
  result: SampleResult,
  message: SampledMessage
): void {
  const packedColors = result.pixels
    ? new Uint32Array(result.pixels.buffer)
    : null;
  for (let index = 0; index < message.sampleIndices.length; index++) {
    const sampleIndex = message.sampleIndices[index]!;
    result.annotationValues[sampleIndex] = message.annotationValues[index]!;
    if (packedColors) packedColors[sampleIndex] = message.colors[index]!;
  }
  result.paintedChunkCount += message.chunkCount;
}
