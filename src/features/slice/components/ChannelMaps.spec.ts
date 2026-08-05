import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, shallowRef } from "vue";
import { createPinia, setActivePinia } from "pinia";
import ChannelMapCanvas from "./ChannelMapCanvas.vue";
import ChannelMaps from "./ChannelMaps.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  makeProbe,
  makeProbeInterfaceProbe,
  makeTerminologyRow
} from "@/test/fixtures";
import { getTerminologyRows } from "@/features/atlas";
import { internProbeInterfaceProbe } from "@/features/experiment";
import { getProbeInterfaceIdentifier } from "@/features/probe";

// Mirrors SliceCanvas.spec.ts: manifest/terminologyRows are computedAsync and
// fetch on store creation, so the leaf module must be mocked or mounting
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

// ChannelMapCanvas owns its sampler internally, so the composable module is
// mocked to avoid a real worker/zarr fetch; this spec never inspects the
// stream's result, only that the canvas mounts and unmounts with visibility.
vi.mock("../composable/useAnnotationSampler", () => ({
  useAnnotationSampler: () => ({
    createStream: () => ({
      result: shallowRef(null),
      isLoading: shallowRef(false)
    }),
    structureIndex: shallowRef(new Map())
  })
}));

/** A 0.07mm x 10mm single-shank contour. */
const SINGLE_SHANK_CONTOUR = [
  [-0.035, 0],
  [0.035, 0],
  [0.035, 10],
  [-0.035, 10]
];

/** Two 0.1mm shanks 1.8mm apart, joined along a top edge at y = 10mm. */
const TWO_SHANK_CONTOUR = [
  [-1, 10],
  [-1, 0],
  [-0.9, 0],
  [-0.9, 10],
  [0.9, 10],
  [0.9, 0],
  [1, 0],
  [1, 10]
];

// happy-dom's IntersectionObserver never invokes its callback, so replace it
// with a fake whose constructor records a trigger function per observed
// `q-intersection` root, giving each test explicit control over visibility.
let observerTriggers: Array<
  (entry: Partial<IntersectionObserverEntry>) => void
> = [];

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerTriggers.push(entry =>
      callback([entry as IntersectionObserverEntry], this as never)
    );
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * Fire the first registered `IntersectionObserver` callback with the given
 * intersection state. `rootBounds` must be non-null, or Quasar's directive
 * treats the entry as stale and re-observes instead of updating visibility.
 * @param isIntersecting Intersection state to report.
 */
async function triggerIntersection(isIntersecting: boolean): Promise<void> {
  observerTriggers[0]!({ isIntersecting, rootBounds: {} as DOMRectReadOnly });
  await nextTick();
}

describe("ChannelMaps", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    observerTriggers = [];
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mountChannelMaps() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useCurrentExperimentStore(pinia);

    const contouredDefinition = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: SINGLE_SHANK_CONTOUR,
      annotations: { manufacturer: "cambridgeneurotech", model_name: "ASSY-1" }
    });
    internProbeInterfaceProbe(store.experiment, contouredDefinition);
    const contouredProbe = makeProbe({
      probeInterfaceIdentifier:
        getProbeInterfaceIdentifier(contouredDefinition),
      name: "Contoured probe"
    });

    const contourlessDefinition = makeProbeInterfaceProbe({
      annotations: { manufacturer: "cambridgeneurotech", model_name: "ASSY-2" }
    });
    internProbeInterfaceProbe(store.experiment, contourlessDefinition);
    const contourlessProbe = makeProbe({
      probeInterfaceIdentifier: getProbeInterfaceIdentifier(
        contourlessDefinition
      ),
      name: "Contourless probe"
    });

    store.experiment.probes = [contouredProbe, contourlessProbe];

    const wrapper = mountWithQuasar(ChannelMaps, { pinia });
    return { wrapper, store };
  }

  it("renders one viewport for the contoured probe at the default (large) zoom height and aspect ratio", () => {
    const { wrapper } = mountChannelMaps();

    const viewports = wrapper.findAll(".channel-maps__viewport");
    expect(viewports).toHaveLength(1);
    const style = viewports[0]!.attributes("style")!;
    expect(style).toContain("height: 70vh");
    expect(style).toContain("aspect-ratio: 0.14");
  });

  it("resizes the viewport when the zoom toggle changes", async () => {
    const { wrapper } = mountChannelMaps();

    const smallButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(btn => btn.text() === "Small")!;
    await smallButton.trigger("click");

    // Small hides the label gutter, so the aspect ratio drops to the
    // shank-only ratio (no `+ gutterMillimeters` term).
    let style = wrapper.find(".channel-maps__viewport").attributes("style");
    expect(style).toContain("height: 15vh");
    expect(style).toContain("aspect-ratio: 0.056");

    const mediumButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(btn => btn.text() === "Medium")!;
    await mediumButton.trigger("click");

    style = wrapper.find(".channel-maps__viewport").attributes("style");
    expect(style).toContain("height: 30vh");
    expect(style).toContain("aspect-ratio: 0.14");
  });

  it("shows the no-contour message and no viewport for a probe without a usable contour", () => {
    const { wrapper } = mountChannelMaps();

    const cards = wrapper.findAllComponents({ name: "QCard" });
    const contourlessCard = cards.find(card =>
      card.text().includes("Contourless probe")
    )!;

    expect(contourlessCard.find(".channel-maps__viewport").exists()).toBe(
      false
    );
    expect(contourlessCard.text()).toContain(
      "This probe has no contour to slice through."
    );
  });

  it("mounts the canvas only while its card is intersecting the viewport", async () => {
    const { wrapper } = mountChannelMaps();

    expect(wrapper.findComponent(ChannelMapCanvas).exists()).toBe(false);

    await triggerIntersection(true);
    expect(wrapper.findComponent(ChannelMapCanvas).exists()).toBe(true);

    await triggerIntersection(false);
    expect(wrapper.findComponent(ChannelMapCanvas).exists()).toBe(false);
  });

  it("packs a two-shank probe into one canvas and mounts it once intersecting", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useCurrentExperimentStore(pinia);

    const twoShankDefinition = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: TWO_SHANK_CONTOUR,
      contact_positions: [
        [-0.95, 1],
        [0.95, 1]
      ],
      shank_ids: ["0", "1"],
      contact_shapes: ["square", "square"],
      contact_shape_params: [{ width: 0.02 }, { width: 0.02 }],
      annotations: { manufacturer: "cambridgeneurotech", model_name: "ASSY-3" }
    });
    internProbeInterfaceProbe(store.experiment, twoShankDefinition);
    const twoShankProbe = makeProbe({
      probeInterfaceIdentifier: getProbeInterfaceIdentifier(twoShankDefinition),
      name: "Two-shank probe"
    });
    store.experiment.probes = [twoShankProbe];

    const wrapper = mountWithQuasar(ChannelMaps, { pinia });

    const viewport = wrapper.find(".channel-maps__viewport");
    const aspectRatio = Number(
      viewport.attributes("style")!.match(/aspect-ratio: ([\d.]+)/)![1]
    );
    expect(aspectRatio).toBeCloseTo(0.28, 10);

    expect(wrapper.findAllComponents(ChannelMapCanvas)).toHaveLength(0);
    await triggerIntersection(true);

    expect(wrapper.findAllComponents(ChannelMapCanvas)).toHaveLength(1);
    expect(
      wrapper.findComponent({ name: "ChannelMapCanvas" }).props("shanks") as
        | unknown[]
        | undefined
    ).toHaveLength(2);
  });

  it("passes the current zoom selection down to the canvas", async () => {
    const { wrapper } = mountChannelMaps();
    await triggerIntersection(true);

    expect(
      wrapper.findComponent({ name: "ChannelMapCanvas" }).props("zoomSelection")
    ).toBe("large");

    const mediumButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(btn => btn.text() === "Medium")!;
    await mediumButton.trigger("click");

    expect(
      wrapper.findComponent({ name: "ChannelMapCanvas" }).props("zoomSelection")
    ).toBe("medium");
  });

  it("renders a channel map window slider for the contoured probe only, bound to its full window", () => {
    const { wrapper } = mountChannelMaps();

    const ranges = wrapper.findAllComponents({ name: "QRange" });
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.props("min")).toBe(0);
    expect(ranges[0]!.props("max")).toBe(10);
    expect(ranges[0]!.props("modelValue")).toEqual({ min: 0, max: 10 });
  });

  it("sizes the slider to the current zoom's canvas height", async () => {
    const { wrapper } = mountChannelMaps();

    const range = wrapper.findComponent({ name: "QRange" });
    expect(range.attributes("style")).toContain("height: 70vh");

    const mediumButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(btn => btn.text() === "Medium")!;
    await mediumButton.trigger("click");

    expect(
      wrapper.findComponent({ name: "QRange" }).attributes("style")
    ).toContain("height: 30vh");
  });

  it("labels the slider's thumbs in mm", () => {
    const { wrapper } = mountChannelMaps();

    const range = wrapper.findComponent({ name: "QRange" });
    expect(range.props("leftLabelValue")).toBe("0.00 mm");
    expect(range.props("rightLabelValue")).toBe("10.00 mm");
  });

  it("writes a dragged window to the probe and re-renders the slider from it", async () => {
    const { wrapper, store } = mountChannelMaps();

    await wrapper
      .findComponent({ name: "QRange" })
      .vm.$emit("update:modelValue", { min: -1, max: 6 });
    await nextTick();

    expect(store.experiment.probes[0]!.channelMapWindow).toEqual({
      min: 0,
      max: 7
    });
    expect(
      wrapper.findComponent({ name: "QRange" }).props("modelValue")
    ).toEqual({ min: 0, max: 7 });
  });

  it("renders the hovered structure's tooltip, and removes it when the hover clears", async () => {
    const { wrapper } = mountChannelMaps();
    await triggerIntersection(true);

    const canvas = wrapper.findComponent({ name: "ChannelMapCanvas" });
    const structure = makeTerminologyRow({
      abbreviation: "CTX",
      name: "Cortex"
    });
    canvas.vm.$emit("hover", { structure, clientX: 100, clientY: 50 });
    await nextTick();

    const tooltip = wrapper.find(".channel-maps__tooltip");
    expect(tooltip.exists()).toBe(true);
    expect(tooltip.text()).toBe("CTX - Cortex");

    canvas.vm.$emit("hover", null);
    await nextTick();

    expect(wrapper.find(".channel-maps__tooltip").exists()).toBe(false);
  });

  it("outlines the card of the selected probe only", async () => {
    const { wrapper, store } = mountChannelMaps();
    store.selectedInspectable = store.experiment.probes[0]!;
    await nextTick();

    const cards = wrapper.findAllComponents({ name: "QCard" });
    const contouredCard = cards.find(card =>
      card.text().includes("Contoured probe")
    )!;
    const contourlessCard = cards.find(card =>
      card.text().includes("Contourless probe")
    )!;

    expect(contouredCard.classes()).toContain("channel-maps__card--selected");
    expect(contourlessCard.classes()).not.toContain(
      "channel-maps__card--selected"
    );
  });

  it("selects the probe when its card is clicked", async () => {
    const { wrapper, store } = mountChannelMaps();

    const contourlessCard = wrapper
      .findAllComponents({ name: "QCard" })
      .find(card => card.text().includes("Contourless probe"))!;
    await contourlessCard.trigger("click");

    expect(store.selectedInspectable).toEqual(store.experiment.probes[1]);
  });

  it("selects the probe from its header name button and reflects it in aria-pressed", async () => {
    const { wrapper, store } = mountChannelMaps();

    const nameButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(btn => btn.text() === "Contoured probe")!;
    expect(nameButton.attributes("aria-pressed")).toBe("false");

    await nameButton.trigger("click");

    expect(store.selectedInspectable).toEqual(store.experiment.probes[0]);
    const updatedButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(btn => btn.text() === "Contoured probe")!;
    expect(updatedButton.attributes("aria-pressed")).toBe("true");
  });
});
