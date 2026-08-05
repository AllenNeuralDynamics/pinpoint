import {
  computed,
  onScopeDispose,
  type ComputedRef,
  type Ref,
  shallowRef,
  watch
} from "vue";
import { createSharedComposable, watchDebounced } from "@vueuse/core";
import type { Readable } from "zarrita";
import type { TerminologyRow } from "@/features/atlas";
import { type Atlas, getAnnotationVolumeUrl } from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { createAnnotationMetadataStore } from "../api/annotation-store.api";
import { openAnnotationVolume } from "../api/annotation-volume.api";
import { getWorkerCount, groupRequestsByShard } from "../api/chunk-shard.api";
import { createSampleResult } from "../api/sample-result.api";
import { selectSamplePlan } from "../api/sample-plan.api";
import { buildStructureLookups } from "../api/structure-colors.api";
import type { AnnotationVolume } from "../models/annotation-level.model";
import type {
  SampleBand,
  SampleGeometry
} from "../models/sample-geometry.model";
import type { SampleResult } from "../models/sample-result.model";
import type {
  InboundSamplerMessage,
  SampledMessage
} from "../models/sampler-message.model";

/** Milliseconds a settled geometry change waits before replanning. */
const REPLAN_DEBOUNCE_MILLISECONDS = 1000 / 60;

/** Milliseconds a continuously changing geometry may coalesce before a replan fires anyway. */
const REPLAN_MAXIMUM_WAIT_MILLISECONDS = 100;

/** Builds one sampler worker. Overridable in tests to avoid a real `Worker`. */
export type SamplerWorkerFactory = () => SamplerWorker;

/** Builds the zarr store the main thread reads volume metadata from. */
export type MetadataStoreFactory = (url: string) => Readable;

/** The subset of `Worker` the composable depends on. */
export interface SamplerWorker {
  postMessage(message: InboundSamplerMessage, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<SampledMessage>) => void) | null;
  terminate(): void;
}

/** One subscribed stream's reactive output. */
export interface AnnotationSampleStream {
  result: Readonly<Ref<SampleResult | null>>;
  isLoading: Readonly<Ref<boolean>>;
}

/** Default factory for the real annotation-sampler worker. */
function defaultWorkerFactory(): SamplerWorker {
  return new Worker(
    new URL("../workers/annotation-sampler.worker.ts", import.meta.url),
    {
      type: "module"
    }
  );
}

/**
 * Create a chunk-sharded pool of annotation-sampler workers driven by the
 * given reactive atlas inputs.
 * @param options Reactive atlas and terminology inputs.
 * @param workerFactory Builds one pool worker.
 * @param metadataStoreFactory Builds the zarr store volume metadata is read from.
 */
export function createAnnotationSampler(
  options: {
    atlas: Ref<Atlas>;
    terminologyRows: Ref<TerminologyRow[]>;
  },
  workerFactory: SamplerWorkerFactory = defaultWorkerFactory,
  metadataStoreFactory: MetadataStoreFactory = createAnnotationMetadataStore
): {
  createStream: (
    geometry: Ref<SampleGeometry | null>
  ) => AnnotationSampleStream;
  structureIndex: ComputedRef<Map<number, TerminologyRow>>;
} {
  const workerCount = getWorkerCount(
    typeof navigator === "undefined" ? 0 : navigator.hardwareConcurrency
  );
  const workers = Array.from({ length: workerCount }, workerFactory);

  let nextStreamId = 0;
  let volume: AnnotationVolume | null = null;
  const streamGenerations = new Map<string, number>();
  const streamRequestCounts = new Map<
    string,
    { total: number; done: number }
  >();
  const streamCallbacks = new Map<string, (message: SampledMessage) => void>();
  // Re-run each stream's last plan attempt once the volume (re)opens, since
  // a stream's geometry may already have settled before the volume's
  // metadata resolved (both are async, independently of each other).
  const streamReplans = new Map<string, () => void>();

  for (const worker of workers) {
    worker.onmessage = event => {
      streamCallbacks.get(event.data.streamId)?.(event.data);
    };
  }

  onScopeDispose(() => {
    for (const worker of workers) worker.terminate();
  });

  function broadcast(message: InboundSamplerMessage): void {
    for (const worker of workers) worker.postMessage(message);
  }

  watch(
    () => getAnnotationVolumeUrl(options.atlas.value),
    async url => {
      volume = null;
      broadcast({ type: "open", url });
      // Metadata-only: opening a volume reads a handful of small zarr.json
      // files, never chunk bytes. The main thread needs the real level
      // shapes/scales to plan and shard correctly; each worker separately
      // opens the same URL for its own chunk-decoding store.
      volume = await openAnnotationVolume(metadataStoreFactory(url));
      for (const replan of streamReplans.values()) replan();
    },
    { immediate: true }
  );

  const structureLookups = computed(() =>
    buildStructureLookups(options.terminologyRows.value)
  );
  watch(
    structureLookups,
    ({ colors }) => broadcast({ type: "colors", colors }),
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

    const result = shallowRef<SampleResult | null>(null);
    const isLoading = shallowRef(false);
    // The last geometry/volume this stream actually dispatched a plan for,
    // so a value-identical but freshly constructed geometry (e.g. a
    // re-interned dependency changing the computed's object identity)
    // doesn't pay for a redundant replan.
    let lastPlanned: {
      geometry: SampleGeometry;
      volume: AnnotationVolume;
    } | null = null;

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
        lastPlanned = null;
        return;
      }
      // The volume may not have opened yet (both are async, independently);
      // `streamReplans` re-invokes this once it does, so just wait.
      if (!volume || volume.levels.length === 0) return;

      if (
        lastPlanned &&
        lastPlanned.volume === volume &&
        isSameGeometry(lastPlanned.geometry, value)
      ) {
        return;
      }

      const generation = (streamGenerations.get(streamId) ?? 0) + 1;
      streamGenerations.set(streamId, generation);

      const plan = selectSamplePlan(value, volume);
      const shardGroups = groupRequestsByShard(plan, workerCount);

      result.value = createSampleResult(
        value.widthPixels,
        value.heightPixels,
        result.value ?? undefined
      );
      result.value.totalChunkCount = plan.chunkRequests.length;

      let dispatchedCount = 0;
      shardGroups.forEach((requests, workerIndex) => {
        if (requests.length === 0) return;
        dispatchedCount++;
        const transfer: Transferable[] = [];
        for (const request of requests) {
          transfer.push(
            request.sampleIndices.buffer,
            request.voxelOffsets.buffer
          );
        }
        workers[workerIndex]!.postMessage(
          {
            type: "sample",
            streamId,
            generation,
            levelIndex: plan.levelIndex,
            requests
          },
          transfer
        );
      });
      streamRequestCounts.set(streamId, { total: dispatchedCount, done: 0 });
      isLoading.value = dispatchedCount > 0;

      lastPlanned = { geometry: value, volume };
    }

    streamReplans.set(streamId, () => planAndSample(geometry.value));

    watchDebounced(geometry, planAndSample, {
      debounce: REPLAN_DEBOUNCE_MILLISECONDS,
      maxWait: REPLAN_MAXIMUM_WAIT_MILLISECONDS,
      immediate: true
    });

    onScopeDispose(() => {
      broadcast({ type: "cancel", streamId });
      streamCallbacks.delete(streamId);
      streamGenerations.delete(streamId);
      streamRequestCounts.delete(streamId);
      streamReplans.delete(streamId);
    });

    return { result, isLoading };
  }

  return {
    createStream,
    structureIndex: computed(() => structureLookups.value.index)
  };
}

/** The app-wide annotation sampler, shared by every consumer. */
export const useAnnotationSampler = createSharedComposable(() => {
  const currentExperiment = useCurrentExperimentStore();
  return createAnnotationSampler({
    atlas: computed(() => currentExperiment.atlas),
    terminologyRows: computed(() => currentExperiment.terminologyRows)
  });
});

/**
 * Apply one worker's sampled flush to a result in place.
 * @param result Result to mutate.
 * @param message Flush to apply.
 */
function applySampledMessage(
  result: SampleResult,
  message: SampledMessage
): void {
  for (let index = 0; index < message.sampleIndices.length; index++) {
    const sampleIndex = message.sampleIndices[index]!;
    result.annotationValues[sampleIndex] = message.annotationValues[index]!;
    result.packedPixels[sampleIndex] = message.colors[index]!;
  }
  result.paintedChunkCount += message.chunkCount;
}

/**
 * Are two geometries sample-for-sample identical, comparing scalars and
 * coordinate triples by value rather than by reference.
 * @param a First geometry to compare.
 * @param b Second geometry to compare.
 */
function isSameGeometry(a: SampleGeometry, b: SampleGeometry): boolean {
  return (
    a.halfHeightMillimeters === b.halfHeightMillimeters &&
    a.widthPixels === b.widthPixels &&
    a.heightPixels === b.heightPixels &&
    isSameTriple(a.rightMillimeters, b.rightMillimeters) &&
    isSameTriple(a.upMillimeters, b.upMillimeters) &&
    a.bands.length === b.bands.length &&
    a.bands.every((band, index) => isSameBand(band, b.bands[index]!))
  );
}

/**
 * Are two bands sample-for-sample identical.
 * @param a First band to compare.
 * @param b Second band to compare.
 */
function isSameBand(a: SampleBand, b: SampleBand): boolean {
  return (
    a.halfWidthMillimeters === b.halfWidthMillimeters &&
    a.columnOffset === b.columnOffset &&
    a.columnCount === b.columnCount &&
    isSameTriple(a.centerMillimeters, b.centerMillimeters)
  );
}

/**
 * Are two 3-element coordinate triples element-wise equal.
 * @param a First triple to compare.
 * @param b Second triple to compare.
 */
function isSameTriple(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
