import { describe, expect, it, vi } from "vitest";
import { nextTick, ref, shallowRef } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import ChannelMapCanvas from "./ChannelMapCanvas.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  makeProbe,
  makeProbeInterfaceProbe,
  makeTerminologyRow
} from "@/test/fixtures";
import type { TerminologyRow } from "@/features/atlas";
import { getTerminologyRows } from "@/features/atlas";
import type { ProbeChannelMapWindow } from "@/features/probe";
import { getProbeContour, getProbeShanks } from "@/features/probe";
import { getChannelMapWidths } from "../api/channel-map-label.api";
import { getProbeFrame, toAtlasMillimeters } from "../api/probe-frame.api";
import type { SampleGeometry } from "../models/sample-geometry.model";
import type { SampleResult } from "../models/sample-result.model";

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

/** Geometry handed to `createStream` by the most recently mounted canvas. */
let capturedGeometry: SampleGeometry | null = null;
const mockResult = shallowRef<SampleResult | null>(null);
const mockIsLoading = shallowRef(false);
const mockStructureIndex = shallowRef(new Map<number, TerminologyRow>());
vi.mock("../composable/useAnnotationSampler", () => ({
  useAnnotationSampler: () => ({
    createStream: (geometry: { value: SampleGeometry | null }) => {
      capturedGeometry = geometry.value;
      return { result: mockResult, isLoading: mockIsLoading };
    },
    structureIndex: mockStructureIndex
  })
}));

// `useElementSize` measures a real layout, which happy-dom never performs,
// so it's replaced with a fixed height matching the plan's worked example
// (600px at pixelRatio 1 quantizes to 576 device pixels).
vi.mock("@vueuse/core", async importOriginal => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...actual,
    useElementSize: () => ({ width: ref(4), height: ref(600) })
  };
});

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

function makeSampleResult(
  widthPixels: number,
  heightPixels: number
): SampleResult {
  const pixels = new Uint8ClampedArray(widthPixels * heightPixels * 4);
  return {
    widthPixels,
    heightPixels,
    annotationValues: new Uint32Array(widthPixels * heightPixels),
    pixels,
    packedPixels: new Uint32Array(pixels.buffer),
    imageData: new ImageData(pixels, widthPixels, heightPixels),
    paintedChunkCount: 1,
    totalChunkCount: 1
  };
}

describe("ChannelMapCanvas", () => {
  function mountCanvas(
    channelMapWindow: ProbeChannelMapWindow | null = null,
    zoomSelection: "small" | "medium" | "large" = "large",
    terminologyRows: TerminologyRow[] = []
  ) {
    vi.mocked(getTerminologyRows).mockResolvedValue(terminologyRows);
    mockStructureIndex.value = new Map(
      terminologyRows.map(row => [row.annotation_value, row])
    );
    capturedGeometry = null;
    mockResult.value = null;
    mockIsLoading.value = false;

    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useCurrentExperimentStore(pinia);

    const probeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: SINGLE_SHANK_CONTOUR,
      contact_positions: [
        [0, 1],
        [0, 2]
      ],
      contact_shapes: ["square", "square"],
      contact_shape_params: [{ width: 0.02 }, { width: 0.02 }]
    });
    const contour = getProbeContour(probeInterfaceProbe)!;
    const shanks = getProbeShanks(probeInterfaceProbe, contour);
    const probe = makeProbe({
      tipPosition: [0, 0, 0],
      rotation: [0, 0, 0],
      channelMapWindow
    });

    const imageFraction =
      zoomSelection === "small" ? 1 : getChannelMapWidths(shanks).imageFraction;
    const wrapper = mountWithQuasar(ChannelMapCanvas, {
      pinia,
      props: {
        probe,
        shanks,
        heightMillimeters: contour.heightMillimeters,
        imageFraction,
        zoomSelection,
        alignmentOffsetMillimeters: 0
      }
    });
    return { wrapper, store, probe, shanks, contour };
  }

  it("hands the sampler a geometry covering every shank's full extent at the measured size", () => {
    const { store, probe, contour } = mountCanvas();
    const frame = getProbeFrame(probe, store.referenceCoordinate);

    expect(capturedGeometry).toEqual({
      rightMillimeters: frame.rightMillimeters.map(n => -n),
      upMillimeters: frame.upMillimeters,
      halfHeightMillimeters: 5,
      widthPixels: 4,
      heightPixels: 576,
      bands: [
        {
          centerMillimeters: toAtlasMillimeters(frame, 0, 5),
          // Derived from columnCount / (2 * pixelsPerMillimeter) = 4 / 115.2,
          // not the shank's true 0.035mm half-width - see getShankLayout.
          halfWidthMillimeters: 4 / 115.2,
          columnOffset: 0,
          columnCount: 4
        }
      ]
    });
    expect(contour.widthMillimeters).toBeCloseTo(0.07);
  });

  it("renders exactly one canvas", () => {
    const { wrapper } = mountCanvas();

    expect(wrapper.findAll("canvas")).toHaveLength(1);
  });

  it("sizes the canvas to a published non-square result", async () => {
    const { wrapper } = mountCanvas();

    mockResult.value = makeSampleResult(4, 576);
    await nextTick();

    const canvas = wrapper.find("canvas").element as HTMLCanvasElement;
    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(576);
  });

  it("draws the shank outline and contact overlay", () => {
    const { wrapper } = mountCanvas();

    const svg = wrapper.find(".channel-map-canvas__overlay");
    // viewBox width is widthPixels / pixelsPerMillimeter = 4 / 57.6, the
    // packed layout's scale - not the shank's true 0.07mm width.
    expect(svg.attributes("viewBox")).toBe(`0 -5 ${4 / 57.6} 10`);

    const outline = wrapper.find(".channel-map-canvas__contour");
    expect(outline.attributes("d")).toBe(
      "M0.035,5L-0.035,5L-0.035,-5L0.035,-5Z"
    );

    const contacts = wrapper.find(".channel-map-canvas__contacts");
    expect(contacts.exists()).toBe(true);
    const d = contacts.attributes("d")!;
    expect(d.startsWith("M")).toBe(true);
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it("crops the sampled geometry and overlay to the probe's channel map window", () => {
    const { wrapper, store, probe } = mountCanvas({ min: 2, max: 4 });
    const frame = getProbeFrame(probe, store.referenceCoordinate);

    expect(capturedGeometry!.halfHeightMillimeters).toBe(1);
    expect(capturedGeometry!.bands[0]!.centerMillimeters).toEqual(
      toAtlasMillimeters(frame, 0, 3)
    );
    expect(capturedGeometry!.widthPixels).toBe(4);
    expect(capturedGeometry!.heightPixels).toBe(576);

    const svg = wrapper.find(".channel-map-canvas__overlay");
    expect(svg.attributes("viewBox")).toBe(`0 -1 ${4 / 57.6} 2`);

    const outline = wrapper.find(".channel-map-canvas__contour");
    expect(outline.attributes("d")).toBe(
      "M0.035,3L-0.035,3L-0.035,-7L0.035,-7Z"
    );
  });

  it("renders the outline with no contact path for a contour-only shank", () => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);

    const pinia = createPinia();
    setActivePinia(pinia);

    const probeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: SINGLE_SHANK_CONTOUR,
      contact_positions: []
    });
    const contour = getProbeContour(probeInterfaceProbe)!;
    const shanks = getProbeShanks(probeInterfaceProbe, contour);
    const probe = makeProbe({ tipPosition: [0, 0, 0], rotation: [0, 0, 0] });

    const wrapper = mountWithQuasar(ChannelMapCanvas, {
      pinia,
      props: {
        probe,
        shanks,
        heightMillimeters: contour.heightMillimeters,
        imageFraction: 1,
        zoomSelection: "large",
        alignmentOffsetMillimeters: 0
      }
    });

    expect(wrapper.find(".channel-map-canvas__contour").exists()).toBe(true);
    expect(wrapper.find(".channel-map-canvas__contacts").exists()).toBe(false);
  });

  it("packs a two-shank probe into one canvas with two bands and two overlay groups", () => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
    capturedGeometry = null;

    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useCurrentExperimentStore(pinia);

    const probeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: TWO_SHANK_CONTOUR,
      contact_positions: [
        [-0.95, 1],
        [0.95, 1]
      ],
      shank_ids: ["0", "1"],
      contact_shapes: ["square", "square"],
      contact_shape_params: [{ width: 0.02 }, { width: 0.02 }]
    });
    const contour = getProbeContour(probeInterfaceProbe)!;
    const shanks = getProbeShanks(probeInterfaceProbe, contour);
    const probe = makeProbe({ tipPosition: [0, 0, 0], rotation: [0, 0, 0] });

    const wrapper = mountWithQuasar(ChannelMapCanvas, {
      pinia,
      props: {
        probe,
        shanks,
        heightMillimeters: contour.heightMillimeters,
        imageFraction: 1,
        zoomSelection: "large",
        alignmentOffsetMillimeters: 0
      }
    });

    expect(wrapper.findAll("canvas")).toHaveLength(1);

    expect(capturedGeometry).not.toBeNull();
    expect(capturedGeometry!.widthPixels).toBe(13);
    expect(capturedGeometry!.heightPixels).toBe(576);
    expect(capturedGeometry!.bands).toHaveLength(2);
    expect(capturedGeometry!.bands.map(band => band.columnOffset)).toEqual([
      7, 0
    ]);
    expect(capturedGeometry!.bands.map(band => band.columnCount)).toEqual([
      6, 6
    ]);

    const frame = getProbeFrame(probe, store.referenceCoordinate);
    expect(capturedGeometry!.bands[0]!.centerMillimeters).toEqual(
      toAtlasMillimeters(frame, -0.95, 5)
    );
    expect(capturedGeometry!.bands[1]!.centerMillimeters).toEqual(
      toAtlasMillimeters(frame, 0.95, 5)
    );

    const groups = wrapper.findAll(".channel-map-canvas__overlay > g");
    expect(groups).toHaveLength(2);
    const firstTranslateX = Number(
      groups[0]!.attributes("transform")!.match(/translate\(([^ ]+) /)![1]
    );
    const secondTranslateX = Number(
      groups[1]!.attributes("transform")!.match(/translate\(([^ ]+) /)![1]
    );
    expect(firstTranslateX).toBeCloseTo(-0.778472, 5);
    expect(secondTranslateX).toBeCloseTo(1, 5);

    const canvas = wrapper.find("canvas");
    expect(canvas.attributes("aria-label")).toBe(
      `In-plane slice for ${probe.name}`
    );
  });

  it("renders no overlay at small zoom", () => {
    const { wrapper } = mountCanvas(null, "small");

    expect(wrapper.find(".channel-map-canvas__overlay").exists()).toBe(false);
  });

  it("renders the contour but no contacts at medium zoom", () => {
    const { wrapper } = mountCanvas(null, "medium");

    expect(wrapper.find(".channel-map-canvas__contour").exists()).toBe(true);
    expect(wrapper.find(".channel-map-canvas__contacts").exists()).toBe(false);
  });

  it("renders both the contour and contacts at large zoom", () => {
    const { wrapper } = mountCanvas(null, "large");

    expect(wrapper.find(".channel-map-canvas__contour").exists()).toBe(true);
    expect(wrapper.find(".channel-map-canvas__contacts").exists()).toBe(true);
  });

  it("renders a run's abbreviation in the label gutter", async () => {
    const structure = makeTerminologyRow({
      annotation_value: 8,
      abbreviation: "CTX",
      name: "Cortex"
    });
    const { wrapper } = mountCanvas(null, "large", [structure]);
    await flushPromises();

    const result = makeSampleResult(1, 4);
    result.annotationValues.set([0, 8, 8, 0]);
    mockResult.value = result;
    await nextTick();

    // Run spans rows 1-2 of 4, centered at (1 + 3) / (2 * 4) = 50% of the
    // mocked 600px gutter, minus half a 12px line box: 300 - 6 = 294px.
    const labels = wrapper.findAll(".channel-map-canvas__label");
    expect(labels).toHaveLength(1);
    expect(labels[0]!.text()).toBe("CTX");
    expect(labels[0]!.attributes("style")).toContain("line-height: 12px");
    expect(labels[0]!.attributes("style")).toContain("top: 294px");
  });

  it("renders only the largest-area structure when two runs crowd each other", async () => {
    const cortex = makeTerminologyRow({
      annotation_value: 8,
      abbreviation: "CTX",
      name: "Cortex"
    });
    const thalamus = makeTerminologyRow({
      annotation_value: 9,
      abbreviation: "TH",
      name: "Thalamus"
    });
    const { wrapper } = mountCanvas(null, "large", [cortex, thalamus]);
    await flushPromises();

    const result = makeSampleResult(1, 1200);
    for (let row = 100; row < 120; row++) result.annotationValues[row] = 8;
    for (let row = 120; row < 160; row++) result.annotationValues[row] = 9;
    mockResult.value = result;
    await nextTick();

    // CTX spans 20 rows centred at 220 / 2400 (top 49px), TH spans 40 rows
    // centred at 280 / 2400 (top 64px): 15px apart, inside the 24px exclusion
    // gap, so only TH's larger area survives.
    const labels = wrapper.findAll(".channel-map-canvas__label");
    expect(labels).toHaveLength(1);
    expect(labels[0]!.text()).toBe("TH");
    expect(labels[0]!.attributes("style")).toContain("top: 64px");
  });

  it("renders both structures when their runs are far apart", async () => {
    const cortex = makeTerminologyRow({
      annotation_value: 8,
      abbreviation: "CTX",
      name: "Cortex"
    });
    const thalamus = makeTerminologyRow({
      annotation_value: 9,
      abbreviation: "TH",
      name: "Thalamus"
    });
    const { wrapper } = mountCanvas(null, "large", [cortex, thalamus]);
    await flushPromises();

    const result = makeSampleResult(1, 1200);
    for (let row = 0; row < 20; row++) result.annotationValues[row] = 8;
    for (let row = 1000; row < 1020; row++) result.annotationValues[row] = 9;
    mockResult.value = result;
    await nextTick();

    const labels = wrapper.findAll(".channel-map-canvas__label");
    expect(labels.map(label => label.text())).toEqual(["CTX", "TH"]);
    expect(labels[0]!.attributes("style")).toContain("top: 0px");
    expect(labels[1]!.attributes("style")).toContain("top: 499px");
  });

  it("renders no labels from a partial result", async () => {
    const structure = makeTerminologyRow({ annotation_value: 8 });
    const { wrapper } = mountCanvas(null, "large", [structure]);
    await flushPromises();

    const result = makeSampleResult(1, 4);
    result.annotationValues.set([0, 8, 8, 0]);
    result.paintedChunkCount = 0;
    result.totalChunkCount = 1;
    mockResult.value = result;
    await nextTick();

    expect(wrapper.find(".channel-map-canvas__label").exists()).toBe(false);
  });

  it("renders no label gutter at small zoom, and a full-width image", () => {
    const { wrapper } = mountCanvas(null, "small");

    expect(wrapper.find(".channel-map-canvas__labels").exists()).toBe(false);
    expect(
      wrapper.find(".channel-map-canvas__image").attributes("style")
    ).toContain("width: 100%");
  });

  it("splits the image and gutter by shank width at medium and large zoom", () => {
    const { wrapper, shanks } = mountCanvas(null, "medium");

    const imageFraction = getChannelMapWidths(shanks).imageFraction;
    expect(
      wrapper.find(".channel-map-canvas__image").attributes("style")
    ).toContain(`width: ${imageFraction * 100}%`);
  });

  it("emits the structure under the pointer on pointermove, and null on pointerleave", async () => {
    const structure = makeTerminologyRow({
      annotation_value: 8,
      abbreviation: "CTX",
      name: "Cortex"
    });
    const { wrapper } = mountCanvas(null, "large", [structure]);
    await flushPromises();

    const result = makeSampleResult(2, 2);
    result.annotationValues.set([8, 0, 0, 0]);
    mockResult.value = result;
    await nextTick();

    const canvasElement = wrapper.find("canvas").element as HTMLCanvasElement;
    vi.spyOn(canvasElement, "getBoundingClientRect").mockReturnValue({
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
    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 120,
      height: 100,
      right: 120,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    await wrapper.find("canvas").trigger("pointermove", {
      clientX: 10,
      clientY: 10
    });

    const hoverEvents = wrapper.emitted("hover")!;
    expect(hoverEvents[hoverEvents.length - 1]![0]).toEqual({
      structure,
      clientX: 120,
      clientY: 10
    });

    await wrapper.find("canvas").trigger("pointerleave");

    const afterLeave = wrapper.emitted("hover")!;
    expect(afterLeave[afterLeave.length - 1]![0]).toBeNull();
  });

  it("shows a progress bar only once loading has run past the debounce delay", async () => {
    vi.useFakeTimers();
    try {
      const { wrapper } = mountCanvas();
      mockIsLoading.value = true;
      await nextTick();

      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        false
      );

      vi.advanceTimersByTime(500);
      await nextTick();

      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        true
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the progress bar immediately once loading finishes", async () => {
    vi.useFakeTimers();
    try {
      const { wrapper } = mountCanvas();
      mockIsLoading.value = true;
      await nextTick();
      vi.advanceTimersByTime(500);
      await nextTick();
      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        true
      );

      mockIsLoading.value = false;
      await nextTick();

      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        false
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
