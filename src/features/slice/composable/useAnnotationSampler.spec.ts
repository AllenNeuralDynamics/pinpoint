import { describe, expect, it, vi } from "vitest";
import { createApp, ref, watch } from "vue";
import { flushPromises } from "@vue/test-utils";
import {
  makeAnnotationVolumeStore,
  makeAtlas,
  makeTerminologyRow
} from "@/test/fixtures";
import type { SampleGeometry } from "../models/sample-geometry.model";
import type {
  InboundSamplerMessage,
  SampledMessage
} from "../models/sampler-message.model";
import { createSamplerHandler } from "../workers/sampler-handler";
import type { SamplerWorker } from "./useAnnotationSampler";
import { createAnnotationSampler } from "./useAnnotationSampler";

/**
 * A `SamplerWorker` double backed by the real message handler (not a mock of
 * message semantics), driven by a shared in-memory zarr store. Every worker
 * in a test pool shares the same store, matching what happens for real
 * workers sharing one URL.
 *
 * Delivery is deferred a macrotask, matching a real `Worker`'s postMessage
 * (which always crosses a thread boundary and is never synchronous) - an
 * in-process handler would otherwise resolve within the same microtask
 * queue, collapsing the "empty result, then populated" window the tests
 * rely on.
 */
function makeFakeWorker(store: Map<string, Uint8Array>): SamplerWorker {
  let onmessage: SamplerWorker["onmessage"] = null;
  const handler = createSamplerHandler(
    message =>
      setTimeout(
        () => onmessage?.({ data: message } as MessageEvent<SampledMessage>),
        0
      ),
    () => store
  );
  return {
    postMessage(message: InboundSamplerMessage) {
      setTimeout(() => void handler.handleMessage(message), 0);
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(value) {
      onmessage = value;
    },
    terminate() {}
  };
}

/** Mount a throwaway component so the composable's `onScopeDispose` has a scope. */
function mountWithComposable<T>(setup: () => T): {
  result: T;
  unmount: () => void;
} {
  let result!: T;
  const app = createApp({
    setup() {
      result = setup();
      return () => null;
    }
  });
  app.mount(document.createElement("div"));
  return { result, unmount: () => app.unmount() };
}

// The fixture volume is a 4^3 array at 0.01mm/voxel, spanning [0, 0.04)mm on
// each axis with 2^3 chunks of 2^3 voxels. (0.01, 0.01, 0.01) sits at the
// center of chunk (0, 0, 0).
function makePlane(overrides: Partial<SampleGeometry> = {}): SampleGeometry {
  return {
    rightMillimeters: [0, 0, 1],
    upMillimeters: [0, -1, 0],
    halfHeightMillimeters: 0.005,
    widthPixels: 2,
    heightPixels: 2,
    bands: [
      {
        centerMillimeters: [0.01, 0.01, 0.01],
        halfWidthMillimeters: 0.005,
        columnOffset: 0,
        columnCount: 2
      }
    ],
    ...overrides
  };
}

/**
 * Build a one-band geometry centered on the given point, leaving every other
 * field at `makePlane`'s defaults.
 * @param centerMillimeters Center to place the sole band at.
 */
function makePlaneAt(
  centerMillimeters: [number, number, number]
): SampleGeometry {
  const plane = makePlane();
  return {
    ...plane,
    bands: [{ ...plane.bands[0]!, centerMillimeters }]
  };
}

describe("createAnnotationSampler", () => {
  it("publishes an empty result before any chunk resolves, then a populated one", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 1, 1, 1, 1, 1, 1, 1]) }
    });
    const workerFactory = () => makeFakeWorker(store);
    const atlas = ref(makeAtlas());
    const terminologyRows = ref([
      makeTerminologyRow({ annotation_value: 1, color_hex_triplet: "#ff0000" })
    ]);

    const { result: sampler, unmount } = mountWithComposable(() =>
      createAnnotationSampler(
        { atlas, terminologyRows },
        workerFactory,
        () => store
      )
    );
    await flushPromises();

    const geometry = ref<SampleGeometry | null>(makePlane());
    const { result, unmount: unmountStream } = mountWithComposable(() =>
      sampler.createStream(geometry)
    );

    // Capture the result snapshot the instant it first becomes non-null via
    // a synchronous watch, rather than polling: `planAndSample` publishes an
    // empty result strictly before any worker can respond, but that window
    // is too narrow for vi.waitFor's poll interval to reliably land inside.
    let firstAnnotationValues: Uint32Array | null = null;
    const stopWatch = watch(
      result.result,
      value => {
        // The composable mutates the same typed arrays in place before
        // republishing, so this must copy the buffer, not just the wrapper.
        if (value && !firstAnnotationValues) {
          firstAnnotationValues = value.annotationValues.slice();
        }
      },
      { immediate: true }
    );

    // isLoading starts false, so waiting on "false" alone would pass
    // instantly, before the throttled plan ever runs. Wait for the watch to
    // actually capture a snapshot first, then for the stream to finish loading.
    await vi.waitFor(() => expect(firstAnnotationValues).not.toBeNull(), {
      timeout: 2000
    });
    await vi.waitFor(() => expect(result.isLoading.value).toBe(false), {
      timeout: 2000
    });
    stopWatch();

    expect(Array.from(firstAnnotationValues!).every(v => v === 0)).toBe(true);
    expect(Array.from(result.result.value!.annotationValues)).toContain(1);

    unmountStream();
    unmount();
  });

  it("sends each chunk to exactly one worker across two overlapping streams", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 1, 1, 1, 1, 1, 1, 1]) }
    });
    const postCalls: { workerIndex: number; streamId: string }[] = [];
    const workerFactory = (() => {
      let index = -1;
      return () => {
        index += 1;
        const workerIndex = index;
        const inner = makeFakeWorker(store);
        // Delegate rather than `{ ...inner }`: spreading an object with an
        // onmessage accessor evaluates it once into a plain value, breaking
        // the live link the composable's `worker.onmessage = ...` depends on.
        return {
          postMessage(message: InboundSamplerMessage) {
            if (message.type === "sample") {
              postCalls.push({ workerIndex, streamId: message.streamId });
            }
            inner.postMessage(message);
          },
          get onmessage() {
            return inner.onmessage;
          },
          set onmessage(value) {
            inner.onmessage = value;
          },
          terminate() {
            inner.terminate();
          }
        };
      };
    })();
    const atlas = ref(makeAtlas());
    const terminologyRows = ref([makeTerminologyRow({ annotation_value: 1 })]);

    const { result: sampler, unmount } = mountWithComposable(() =>
      createAnnotationSampler(
        { atlas, terminologyRows },
        workerFactory,
        () => store
      )
    );
    await flushPromises();

    const geometryA = ref<SampleGeometry | null>(makePlane());
    const geometryB = ref<SampleGeometry | null>(makePlane());
    const { result: streamA, unmount: unmountA } = mountWithComposable(() =>
      sampler.createStream(geometryA)
    );
    const { result: streamB, unmount: unmountB } = mountWithComposable(() =>
      sampler.createStream(geometryB)
    );

    // isLoading starts false for both streams, so wait for actual dispatch
    // (postCalls growing) before treating "false" as "finished" rather than
    // "hasn't started".
    await vi.waitFor(() => expect(postCalls.length).toBeGreaterThan(0), {
      timeout: 2000
    });
    await vi.waitFor(() => expect(streamA.isLoading.value).toBe(false), {
      timeout: 2000
    });
    await vi.waitFor(() => expect(streamB.isLoading.value).toBe(false), {
      timeout: 2000
    });

    // Every worker that received chunk 0/0/0 for stream A must be the same
    // worker that received it for stream B - sharding is by chunk, not by
    // stream, so the same chunk is never split across workers.
    const workersForA = new Set(
      postCalls.filter(c => c.streamId === "stream-0").map(c => c.workerIndex)
    );
    const workersForB = new Set(
      postCalls.filter(c => c.streamId === "stream-1").map(c => c.workerIndex)
    );
    expect(workersForA).toEqual(workersForB);

    unmountA();
    unmountB();
    unmount();
  });

  it("a later geometry change's result replaces the earlier one's with no stale contamination", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: {
        "0/0/0": Uint32Array.from([1, 1, 1, 1, 1, 1, 1, 1]),
        "0/0/1": Uint32Array.from([2, 2, 2, 2, 2, 2, 2, 2])
      }
    });
    const workerFactory = () => makeFakeWorker(store);
    const atlas = ref(makeAtlas());
    const terminologyRows = ref([
      makeTerminologyRow({ annotation_value: 1 }),
      makeTerminologyRow({ annotation_value: 2 })
    ]);

    const { result: sampler, unmount } = mountWithComposable(() =>
      createAnnotationSampler(
        { atlas, terminologyRows },
        workerFactory,
        () => store
      )
    );
    await flushPromises();

    // Chunk (0,0,0) covers mm [0,0.02) on every axis; chunk (0,0,1) covers
    // [0,0.02) x [0,0.02) x [0.02,0.04).
    const geometry = ref<SampleGeometry | null>(
      makePlaneAt([0.01, 0.01, 0.01])
    );
    const { result, unmount: unmountStream } = mountWithComposable(() =>
      sampler.createStream(geometry)
    );

    await vi.waitFor(
      () =>
        expect(
          Array.from(result.result.value?.annotationValues ?? [])
        ).toContain(1),
      { timeout: 2000 }
    );

    // A later geometry pointed at a different chunk must fully replace the
    // first plan's generation - if the superseded generation's flush were
    // applied, value 1 would leak into this result alongside value 2.
    geometry.value = makePlaneAt([0.01, 0.01, 0.03]);

    await vi.waitFor(
      () =>
        expect(
          Array.from(result.result.value?.annotationValues ?? [])
        ).toContain(2),
      { timeout: 2000 }
    );
    await vi.waitFor(() => expect(result.isLoading.value).toBe(false), {
      timeout: 2000
    });

    expect(Array.from(result.result.value!.annotationValues)).not.toContain(1);

    unmountStream();
    unmount();
  });

  it("replans an isolated geometry change after the stream has settled, e.g. switching probes", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: {
        "0/0/0": Uint32Array.from([1, 1, 1, 1, 1, 1, 1, 1]),
        "0/0/1": Uint32Array.from([2, 2, 2, 2, 2, 2, 2, 2])
      }
    });
    const workerFactory = () => makeFakeWorker(store);
    const atlas = ref(makeAtlas());
    const terminologyRows = ref([
      makeTerminologyRow({ annotation_value: 1 }),
      makeTerminologyRow({ annotation_value: 2 })
    ]);

    const { result: sampler, unmount } = mountWithComposable(() =>
      createAnnotationSampler(
        { atlas, terminologyRows },
        workerFactory,
        () => store
      )
    );
    await flushPromises();

    const geometry = ref<SampleGeometry | null>(
      makePlaneAt([0.01, 0.01, 0.01])
    );
    const { result, unmount: unmountStream } = mountWithComposable(() =>
      sampler.createStream(geometry)
    );

    await vi.waitFor(
      () =>
        expect(
          Array.from(result.result.value?.annotationValues ?? [])
        ).toContain(1),
      { timeout: 2000 }
    );
    await vi.waitFor(() => expect(result.isLoading.value).toBe(false), {
      timeout: 2000
    });

    // Wait well past a replan interval so the stream is fully settled - a
    // plain `leading: false` throttle drops a change that arrives here,
    // which is exactly what happens when switching to a probe whose
    // geometry differs from the previously selected one.
    await new Promise(resolve => setTimeout(resolve, 100));

    geometry.value = makePlaneAt([0.01, 0.01, 0.03]);

    await vi.waitFor(
      () =>
        expect(
          Array.from(result.result.value?.annotationValues ?? [])
        ).toContain(2),
      { timeout: 2000 }
    );

    unmountStream();
    unmount();
  });

  it("terminates every worker once the composable's shared scope disposes", async () => {
    const store = makeAnnotationVolumeStore();
    const terminateSpies: ReturnType<typeof vi.fn>[] = [];
    const workerFactory = () => {
      const inner = makeFakeWorker(store);
      const spy = vi.fn();
      terminateSpies.push(spy);
      return { ...inner, terminate: spy };
    };
    const atlas = ref(makeAtlas());
    const terminologyRows = ref([]);

    const { result: sampler, unmount } = mountWithComposable(() =>
      createAnnotationSampler(
        { atlas, terminologyRows },
        workerFactory,
        () => store
      )
    );
    await flushPromises();

    const geometry = ref<SampleGeometry | null>(null);
    const { unmount: unmountStream } = mountWithComposable(() =>
      sampler.createStream(geometry)
    );

    unmountStream();
    for (const spy of terminateSpies) expect(spy).not.toHaveBeenCalled();

    unmount();
    for (const spy of terminateSpies) expect(spy).toHaveBeenCalledOnce();
  });

  it("clears the result and stops loading when the geometry becomes null", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 1, 1, 1, 1, 1, 1, 1]) }
    });
    const workerFactory = () => makeFakeWorker(store);
    const atlas = ref(makeAtlas());
    const terminologyRows = ref([makeTerminologyRow({ annotation_value: 1 })]);

    const { result: sampler, unmount } = mountWithComposable(() =>
      createAnnotationSampler(
        { atlas, terminologyRows },
        workerFactory,
        () => store
      )
    );
    await flushPromises();

    const geometry = ref<SampleGeometry | null>(makePlane());
    const { result, unmount: unmountStream } = mountWithComposable(() =>
      sampler.createStream(geometry)
    );
    // isLoading starts false, so wait for the result to actually populate
    // (the signal that the throttled plan has run) before treating a
    // "false" isLoading as "finished" rather than "hasn't started".
    await vi.waitFor(() => expect(result.result.value).not.toBeNull(), {
      timeout: 2000
    });
    await vi.waitFor(() => expect(result.isLoading.value).toBe(false), {
      timeout: 2000
    });

    geometry.value = null;
    await vi.waitFor(() => expect(result.result.value).toBeNull());
    expect(result.isLoading.value).toBe(false);

    unmountStream();
    unmount();
  });

  it("skips a redundant replan when a value-equal but freshly constructed geometry is assigned", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 1, 1, 1, 1, 1, 1, 1]) }
    });
    const postCalls: { type: string }[] = [];
    const workerFactory = () => {
      const inner = makeFakeWorker(store);
      return {
        postMessage(message: InboundSamplerMessage) {
          if (message.type === "sample") {
            postCalls.push({ type: message.type });
          }
          inner.postMessage(message);
        },
        get onmessage() {
          return inner.onmessage;
        },
        set onmessage(value) {
          inner.onmessage = value;
        },
        terminate() {
          inner.terminate();
        }
      };
    };
    const atlas = ref(makeAtlas());
    const terminologyRows = ref([makeTerminologyRow({ annotation_value: 1 })]);

    const { result: sampler, unmount } = mountWithComposable(() =>
      createAnnotationSampler(
        { atlas, terminologyRows },
        workerFactory,
        () => store
      )
    );
    await flushPromises();

    const geometry = ref<SampleGeometry | null>(makePlane());
    const { result, unmount: unmountStream } = mountWithComposable(() =>
      sampler.createStream(geometry)
    );

    await vi.waitFor(() => expect(postCalls.length).toBeGreaterThan(0), {
      timeout: 2000
    });
    await vi.waitFor(() => expect(result.isLoading.value).toBe(false), {
      timeout: 2000
    });

    const sampleCallsAfterSettle = postCalls.length;
    // A freshly constructed but value-equal geometry - not the same object
    // as `geometry.value`, matching a re-interned dependency changing a
    // computed's object identity without changing any of its values.
    geometry.value = makePlane();
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(postCalls.length).toBe(sampleCallsAfterSettle);

    unmountStream();
    unmount();
  });
});
