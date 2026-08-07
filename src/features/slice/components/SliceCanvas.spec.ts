import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref, shallowRef, type Ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import SliceCanvas from "./SliceCanvas.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  makeAtlas,
  makeManifest,
  makeProbe,
  makeProbeInterfaceProbe,
  makeTerminologyRow
} from "@/test/fixtures";
import type { Atlas, TerminologyRow } from "@/features/atlas";
import { getTerminologyRows } from "@/features/atlas";
import { internProbeInterfaceProbe } from "@/features/experiment";
import { getProbeInterfaceIdentifier } from "@/features/probe";
import type { SampleGeometry } from "../models/sample-geometry.model";
import type { SampleResult } from "../models/sample-result.model";

// Mirrors ProbeInspector.spec.ts: manifest/terminologyRows are computedAsync
// and fetch on store creation, so the leaf module must be mocked or mounting
// triggers real network calls.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

// SliceCanvas owns its sampler internally rather than taking it as a prop,
// so the composable module itself is mocked to hand the spec direct control
// over `result`/`isLoading`, without a real worker or zarr fetch.
/** Geometry handed to `createStream` by the most recently mounted canvas. */
let capturedGeometry: Ref<SampleGeometry | null> | null = null;
const mockResult = shallowRef<SampleResult | null>(null);
const mockIsLoading = shallowRef(false);
const mockStructureIndex = shallowRef(new Map<number, TerminologyRow>());
vi.mock("../composable/useAnnotationSampler", () => ({
  useAnnotationSampler: () => ({
    createStream: (geometry: Ref<SampleGeometry | null>) => {
      capturedGeometry = geometry;
      return { result: mockResult, isLoading: mockIsLoading };
    },
    structureIndex: mockStructureIndex
  })
}));

// `useElementSize` measures a real layout, which happy-dom never performs,
// so it's pinned to a fixed square matching the motion-scale test's worked
// example (2400 device px at pixelRatio 1 clamps to the 1024 maximum).
vi.mock("@vueuse/core", async importOriginal => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...actual,
    useElementSize: () => ({ width: ref(2400), height: ref(2400) }),
    useDevicePixelRatio: () => ({ pixelRatio: ref(1) })
  };
});

/** A 10mm-square contour with a single contact 2mm above the tip. */
const CONTOUR = [
  [-5, 0],
  [5, 0],
  [5, 10],
  [-5, 10]
];

function makeSampleResult(
  sizePixels: number,
  annotationValues: number[]
): SampleResult {
  const pixels = new Uint8ClampedArray(sizePixels * sizePixels * 4);
  return {
    widthPixels: sizePixels,
    heightPixels: sizePixels,
    annotationValues: Uint32Array.from(annotationValues),
    pixels,
    packedPixels: new Uint32Array(pixels.buffer),
    imageData: new ImageData(pixels, sizePixels, sizePixels),
    paintedChunkCount: 1,
    totalChunkCount: 1
  };
}

describe("SliceCanvas", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
    mockResult.value = null;
    mockIsLoading.value = false;
    mockStructureIndex.value = new Map();
  });

  function mountSlice(
    probeOverrides: Parameters<typeof makeProbe>[0] = {},
    atlasOverride?: Atlas
  ) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useCurrentExperimentStore(pinia);
    if (atlasOverride) store.experiment.atlas = atlasOverride;

    const probeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: CONTOUR,
      contact_positions: [[0, 2]]
    });
    internProbeInterfaceProbe(store.experiment, probeInterfaceProbe);
    const probe = makeProbe({
      probeInterfaceIdentifier:
        getProbeInterfaceIdentifier(probeInterfaceProbe),
      ...probeOverrides
    });
    store.experiment.probes = [probe];

    const wrapper = mountWithQuasar(SliceCanvas, { pinia, props: { probe } });
    return { wrapper, store, probe };
  }

  it("shows the no-contour message when the probe has no usable contour", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useCurrentExperimentStore(pinia);
    const probeInterfaceProbe = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(store.experiment, probeInterfaceProbe);
    const probe = makeProbe({
      probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe)
    });
    store.experiment.probes = [probe];

    const wrapper = mountWithQuasar(SliceCanvas, { pinia, props: { probe } });

    // A bare `find("svg")` would also match the zoom slider's own thumb-shape
    // svg (always rendered), so this scopes to the contour overlay itself.
    expect(wrapper.find(".slice-canvas__overlay").exists()).toBe(false);
  });

  it("draws the contour overlay re-origined on the center slider's height", () => {
    const { wrapper } = mountSlice({ sliceCenterHeightMillimeters: 2 });

    const polygon = wrapper.find("polygon");
    expect(polygon.exists()).toBe(true);
    const points = polygon.attributes("points");
    expect(points).toBeTruthy();

    const parsed = points!
      .trim()
      .split(" ")
      .map(pair => pair.split(",").map(Number));
    expect(parsed).toEqual([
      [-5, 2],
      [5, 2],
      [5, -8],
      [-5, -8]
    ]);
  });

  it("reads the center slider from the probe's saved height, clamped to the contour", () => {
    const { wrapper } = mountSlice({ sliceCenterHeightMillimeters: 999 });

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const centerSlider = sliders.find(s => s.props("vertical") === true)!;
    expect(centerSlider.props("modelValue")).toBe(10);
  });

  it("moving the center slider writes the height to the probe", async () => {
    const { wrapper, probe } = mountSlice({ sliceCenterHeightMillimeters: 0 });

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const centerSlider = sliders.find(s => s.props("vertical") === true)!;
    await centerSlider.vm.$emit("update:modelValue", 6);

    expect(probe.sliceCenterHeightMillimeters).toBe(6);
  });

  it("reads the zoom slider from the probe's saved extent, in log2 space", () => {
    const { wrapper } = mountSlice({ sliceExtentMillimeters: 4 });

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const zoomSlider = sliders.find(s => s.props("vertical") !== true)!;
    expect(zoomSlider.props("modelValue")).toBe(2);
  });

  it("moving the zoom slider writes the converted extent to the probe", async () => {
    const { wrapper, probe } = mountSlice({ sliceExtentMillimeters: 2 });

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const zoomSlider = sliders.find(s => s.props("vertical") !== true)!;
    await zoomSlider.vm.$emit("update:modelValue", 3);

    expect(probe.sliceExtentMillimeters).toBe(8);
  });

  it("switching to a different probe picks up that probe's own saved values", async () => {
    const { wrapper, store } = mountSlice({
      sliceExtentMillimeters: 2,
      sliceCenterHeightMillimeters: 0
    });

    const otherProbeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: CONTOUR,
      contact_positions: [[0, 2]]
    });
    internProbeInterfaceProbe(store.experiment, otherProbeInterfaceProbe);
    const otherProbe = makeProbe({
      probeInterfaceIdentifier: getProbeInterfaceIdentifier(
        otherProbeInterfaceProbe
      ),
      sliceExtentMillimeters: 8,
      sliceCenterHeightMillimeters: 4
    });
    store.experiment.probes.push(otherProbe);

    // Cast: `setProps`'s generic doesn't narrow to the SFC's declared props.
    await wrapper.setProps({ probe: otherProbe } as Record<string, unknown>);

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const zoomSlider = sliders.find(s => s.props("vertical") !== true)!;
    const centerSlider = sliders.find(s => s.props("vertical") === true)!;
    expect(zoomSlider.props("modelValue")).toBe(3);
    expect(centerSlider.props("modelValue")).toBe(4);
  });

  it("shows a tooltip for the structure under a hovered pixel", async () => {
    mockResult.value = makeSampleResult(2, [0, 8, 0, 0]);
    const rows = [makeTerminologyRow({ annotation_value: 8, identifier: 8 })];
    vi.mocked(getTerminologyRows).mockResolvedValue(rows);
    mockStructureIndex.value = new Map(
      rows.map(row => [row.annotation_value, row])
    );
    const { wrapper } = mountSlice();
    await flushPromises();

    const canvas = wrapper.find("canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    // Pixel (1, 0) of a 2x2 result maps to the top-right quadrant of a
    // 100x100 element, i.e. clientX/Y around (75, 25). QTooltip only
    // attaches its mouseenter listener once mounted (`v-if="hoveredStructure"`)
    // and only renders portalled content once "showing" - so pointermove
    // must land first to mount it, then a mouseenter on its DOM parent (its
    // default anchor - the square container, not the canvas itself) to open
    // it, then a real (zero-delay) timer tick for its registerTimeout to fire.
    await canvas.trigger("pointermove", { clientX: 75, clientY: 25 });
    await wrapper.find(".slice-canvas__square").trigger("mouseenter");
    await new Promise(resolve => setTimeout(resolve, 0));
    await flushPromises();

    // QTooltip teleports its shown content to a global node appended
    // directly to document.body, outside the wrapper's own mounted
    // subtree, so it must be queried there rather than through `wrapper`.
    expect(document.body.querySelector(".q-tooltip")?.textContent).toContain(
      rows[0]!.abbreviation
    );
  });

  it("shows no tooltip over a background pixel", async () => {
    mockResult.value = makeSampleResult(2, [0, 0, 0, 0]);
    const { wrapper } = mountSlice();
    await wrapper.vm.$nextTick();

    const canvas = wrapper.find("canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    await canvas.trigger("pointermove", { clientX: 10, clientY: 10 });

    expect(wrapper.findComponent({ name: "QTooltip" }).exists()).toBe(false);
  });

  it("clears the hovered structure on pointer leave", async () => {
    mockResult.value = makeSampleResult(2, [0, 8, 0, 0]);
    const rows = [makeTerminologyRow({ annotation_value: 8, identifier: 8 })];
    vi.mocked(getTerminologyRows).mockResolvedValue(rows);
    mockStructureIndex.value = new Map(
      rows.map(row => [row.annotation_value, row])
    );
    const { wrapper } = mountSlice();
    await flushPromises();

    const canvas = wrapper.find("canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    await canvas.trigger("pointermove", { clientX: 75, clientY: 25 });
    expect(wrapper.findComponent({ name: "QTooltip" }).exists()).toBe(true);

    await canvas.trigger("pointerleave");
    expect(wrapper.findComponent({ name: "QTooltip" }).exists()).toBe(false);
  });

  it("shows a tooltip for a structure hovered right after background, with no intervening leave/re-enter", async () => {
    // Regression: QTooltip normally shows itself from its own anchor's
    // mouseenter, but that anchor (the `v-if="hoveredStructure"` element)
    // doesn't exist yet while the pointer is over background - moving
    // straight onto a structure from there produces no further mouseenter
    // to trigger it, so with QTooltip's default behaviour this would stay
    // hidden until the pointer left the canvas and came back.
    mockResult.value = makeSampleResult(2, [0, 8, 0, 0]);
    const rows = [makeTerminologyRow({ annotation_value: 8, identifier: 8 })];
    vi.mocked(getTerminologyRows).mockResolvedValue(rows);
    mockStructureIndex.value = new Map(
      rows.map(row => [row.annotation_value, row])
    );
    const { wrapper } = mountSlice();
    await flushPromises();

    const canvas = wrapper.find("canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    // Pixel (0, 0) is background; no mouseenter/pointerleave follows. Checked
    // via the wrapper's own tree (like the neighboring "shows no tooltip
    // over a background pixel" test) rather than `document.body`, since
    // QTooltip's portalled content from earlier specs in this file persists
    // globally without an intervening unmount.
    await canvas.trigger("pointermove", { clientX: 25, clientY: 25 });
    expect(wrapper.findComponent({ name: "QTooltip" }).exists()).toBe(false);

    await canvas.trigger("pointermove", { clientX: 75, clientY: 25 });
    await flushPromises();

    expect(document.body.querySelector(".q-tooltip")?.textContent).toContain(
      rows[0]!.abbreviation
    );
  });

  it("clicking a hovered structure toggles it into visibleStructures, and again removes it", async () => {
    mockResult.value = makeSampleResult(2, [0, 8, 0, 0]);
    const rows = [makeTerminologyRow({ annotation_value: 8, identifier: 8 })];
    vi.mocked(getTerminologyRows).mockResolvedValue(rows);
    mockStructureIndex.value = new Map(
      rows.map(row => [row.annotation_value, row])
    );
    const { wrapper, store } = mountSlice();
    await flushPromises();

    const canvas = wrapper.find("canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    await canvas.trigger("pointermove", { clientX: 75, clientY: 25 });
    await canvas.trigger("click");
    expect(store.experiment.visibleStructures).toContainEqual({
      id: 8,
      isTransparent: false
    });

    await canvas.trigger("click");
    expect(store.experiment.visibleStructures).not.toContainEqual({
      id: 8,
      isTransparent: false
    });
  });

  it("clicking a transparent structure removes it, and a second click makes it opaque", async () => {
    mockResult.value = makeSampleResult(2, [0, 8, 0, 0]);
    const rows = [makeTerminologyRow({ annotation_value: 8, identifier: 8 })];
    vi.mocked(getTerminologyRows).mockResolvedValue(rows);
    mockStructureIndex.value = new Map(
      rows.map(row => [row.annotation_value, row])
    );
    const { wrapper, store } = mountSlice();
    await flushPromises();
    store.experiment.visibleStructures = [{ id: 8, isTransparent: true }];

    const canvas = wrapper.find("canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    await canvas.trigger("pointermove", { clientX: 75, clientY: 25 });
    await canvas.trigger("click");
    expect(store.experiment.visibleStructures).not.toContainEqual({
      id: 8,
      isTransparent: true
    });
    expect(store.experiment.visibleStructures).not.toContainEqual({
      id: 8,
      isTransparent: false
    });

    await canvas.trigger("click");
    expect(store.experiment.visibleStructures).toContainEqual({
      id: 8,
      isTransparent: false
    });
  });

  it("a click over background is a no-op", async () => {
    mockResult.value = makeSampleResult(2, [0, 0, 0, 0]);
    const { wrapper, store } = mountSlice();
    await wrapper.vm.$nextTick();
    const before = [...store.experiment.visibleStructures];

    const canvas = wrapper.find("canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    await canvas.trigger("pointermove", { clientX: 10, clientY: 10 });
    await canvas.trigger("click");

    expect(store.experiment.visibleStructures).toEqual(before);
  });

  it("shows a progress bar only once loading has run past the debounce delay", async () => {
    vi.useFakeTimers();
    try {
      mockIsLoading.value = true;
      const { wrapper } = mountSlice();
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        false
      );

      vi.advanceTimersByTime(500);
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        true
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("never shows a progress bar for a load that finishes before the debounce delay", async () => {
    vi.useFakeTimers();
    try {
      mockIsLoading.value = true;
      const { wrapper } = mountSlice();
      await wrapper.vm.$nextTick();

      vi.advanceTimersByTime(200);
      mockIsLoading.value = false;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(500);
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        false
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the progress bar immediately once loading finishes", async () => {
    vi.useFakeTimers();
    try {
      mockIsLoading.value = true;
      const { wrapper } = mountSlice();
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(500);
      await wrapper.vm.$nextTick();
      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        true
      );

      mockIsLoading.value = false;
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        false
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the canvas when switching to a different probe, instead of holding the old image", async () => {
    // happy-dom's canvas has no real 2D rendering backend (`getContext("2d")`
    // resolves to null), so painting is observed through a stand-in context
    // recording calls rather than by reading pixels back. The mock is global
    // (every canvas in this file, including ones from prior specs still
    // mounted in happy-dom, resolves to it), and `mockResult` is a shared
    // module-level ref, so assertions below compare call-count deltas rather
    // than absolute counts.
    const context = {
      clearRect: vi.fn(),
      putImageData: vi.fn()
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );

    mockResult.value = makeSampleResult(2, [1, 1, 1, 1]);
    const { wrapper, store } = mountSlice();
    await flushPromises();

    const paintedBeforeSwitch = context.putImageData.mock.calls.length;
    expect(paintedBeforeSwitch).toBeGreaterThan(0);

    const otherProbeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: CONTOUR,
      contact_positions: [[0, 2]]
    });
    internProbeInterfaceProbe(store.experiment, otherProbeInterfaceProbe);
    const otherProbe = makeProbe({
      probeInterfaceIdentifier: getProbeInterfaceIdentifier(
        otherProbeInterfaceProbe
      )
    });
    store.experiment.probes.push(otherProbe);

    // The mock sampler never publishes a new result on its own, so the only
    // way this wrapper's canvas can clear here is the component's own
    // probe-switch handling.
    // Cast: `setProps`'s generic doesn't narrow to the SFC's declared props.
    await wrapper.setProps({ probe: otherProbe } as Record<string, unknown>);

    expect(context.clearRect).toHaveBeenCalled();

    // The stale image must not still be considered current once a new
    // result streams in for the new probe.
    mockResult.value = makeSampleResult(2, [2, 2, 2, 2]);
    await wrapper.vm.$nextTick();
    expect(context.putImageData.mock.calls.length).toBeGreaterThan(
      paintedBeforeSwitch
    );
  });

  it("scales the zoom slider's range to the current atlas's longest dimension", async () => {
    const { wrapper } = mountSlice(
      {},
      makeAtlas({
        manifest: makeManifest({
          resolutions: [[0.5, 0.5, 0.5]],
          shape: [[394, 394, 394]]
        })
      })
    );
    await flushPromises();

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const zoomSlider = sliders.find(s => s.props("vertical") !== true)!;
    // Longest dimension is 197mm; ceil(log2(197)) = 8, spanning 6 octaves down.
    expect(zoomSlider.props("min")).toBe(2);
    expect(zoomSlider.props("max")).toBe(8);
  });

  it("clamps a persisted extent outside the current atlas's zoom range into range", async () => {
    const { wrapper } = mountSlice(
      { sliceExtentMillimeters: 2 },
      makeAtlas({
        manifest: makeManifest({
          resolutions: [[0.5, 0.5, 0.5]],
          shape: [[394, 394, 394]]
        })
      })
    );
    await flushPromises();

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const zoomSlider = sliders.find(s => s.props("vertical") !== true)!;
    // 2mm (log2 = 1) is below this atlas's range minimum (2), so it clamps up.
    expect(zoomSlider.props("modelValue")).toBe(2);
  });

  it("defaults a probe whose zoom has never been set to the middle of the mouse-scale range", async () => {
    const { wrapper } = mountSlice({ sliceExtentMillimeters: null });
    await flushPromises();

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const zoomSlider = sliders.find(s => s.props("vertical") !== true)!;
    // Mouse range is {-2, 4}; its middle, exponent 1, is 2mm - the same
    // value `buildProbe` used to hardcode.
    expect(zoomSlider.props("modelValue")).toBe(1);
  });

  it("defaults a probe whose zoom has never been set to the middle of a human-scale range", async () => {
    const { wrapper } = mountSlice(
      { sliceExtentMillimeters: null },
      makeAtlas({
        manifest: makeManifest({
          resolutions: [[0.5, 0.5, 0.5]],
          shape: [[394, 394, 394]]
        })
      })
    );
    await flushPromises();

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const zoomSlider = sliders.find(s => s.props("vertical") !== true)!;
    // This atlas's range is {2, 8}; its middle, exponent 5, is 32mm - not
    // pinned to the range's minimum, as a hardcoded 2mm default would be.
    expect(zoomSlider.props("modelValue")).toBe(5);
  });

  it("samples at a lower resolution while the probe pose keeps changing, then returns to full resolution once it settles", async () => {
    vi.useFakeTimers();
    try {
      const { store } = mountSlice();
      await flushPromises();

      // 2400 device px at pixelRatio 1 clamps to the 1024 maximum.
      expect(capturedGeometry!.value!.widthPixels).toBe(1024);

      // Two quick pose changes count as continuous movement.
      store.experiment.probes[0]!.tipPosition = [1, 0, 0];
      await nextTick();
      store.experiment.probes[0]!.tipPosition = [2, 0, 0];
      await nextTick();

      // floor(2400 * 0.25 / 32) * 32.
      expect(capturedGeometry!.value!.widthPixels).toBe(576);

      vi.advanceTimersByTime(200);
      await nextTick();

      expect(capturedGeometry!.value!.widthPixels).toBe(1024);
    } finally {
      vi.useRealTimers();
    }
  });
});
