import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { getProbeContour } from "@/features/probe";
import { makeAtlas, makeProbe, makeProbeInterfaceProbe } from "@/test/fixtures";
import { useSliceViewport } from "./useSliceViewport";

const CONTOUR = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10]
];

function makeContour() {
  return getProbeContour(
    makeProbeInterfaceProbe({ si_units: "mm", probe_planar_contour: CONTOUR })
  )!;
}

describe("useSliceViewport", () => {
  it("defaults the extent to the middle of the zoom range when unset", () => {
    const probe = ref(makeProbe({ sliceExtentMillimeters: null }));
    const { extentMillimeters } = useSliceViewport(
      probe,
      ref(null),
      ref(makeAtlas())
    );

    expect(extentMillimeters.value).toBe(2);
  });

  it("clamps a persisted extent outside the current atlas's range", () => {
    const probe = ref(makeProbe({ sliceExtentMillimeters: 1000 }));
    const { extentMillimeters } = useSliceViewport(
      probe,
      ref(null),
      ref(makeAtlas())
    );

    expect(extentMillimeters.value).toBe(2 ** 4);
  });

  it("writes zoomExponent back to the probe as an extent in mm", () => {
    const probe = ref(makeProbe({ sliceExtentMillimeters: 2 }));
    const { zoomExponent } = useSliceViewport(
      probe,
      ref(null),
      ref(makeAtlas())
    );

    zoomExponent.value = 3;

    expect(probe.value.sliceExtentMillimeters).toBe(8);
  });

  it("clamps the center height into the contour's range", () => {
    const probe = ref(makeProbe({ sliceCenterHeightMillimeters: 999 }));
    const { centerHeightMillimeters } = useSliceViewport(
      probe,
      ref(makeContour()),
      ref(makeAtlas())
    );

    expect(centerHeightMillimeters.value).toBe(10);
  });

  it("writes centerHeightMillimeters back to the probe", () => {
    const probe = ref(makeProbe({ sliceCenterHeightMillimeters: 0 }));
    const { centerHeightMillimeters } = useSliceViewport(
      probe,
      ref(makeContour()),
      ref(makeAtlas())
    );

    centerHeightMillimeters.value = 6;

    expect(probe.value.sliceCenterHeightMillimeters).toBe(6);
  });

  it("picks up a different probe's own persisted state once probe changes", () => {
    const probe = ref(
      makeProbe({ sliceExtentMillimeters: 2, sliceCenterHeightMillimeters: 0 })
    );
    const { extentMillimeters, centerHeightMillimeters } = useSliceViewport(
      probe,
      ref(null),
      ref(makeAtlas())
    );

    probe.value = makeProbe({
      sliceExtentMillimeters: 8,
      sliceCenterHeightMillimeters: 4
    });

    expect(extentMillimeters.value).toBe(8);
    expect(centerHeightMillimeters.value).toBe(4);
  });
});
