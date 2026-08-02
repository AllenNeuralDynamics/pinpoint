import { describe, expect, it } from "vitest";
import { getProbeContour } from "@/features/probe";
import {
  makeManifest,
  makeProbe,
  makeProbeInterfaceProbe
} from "@/test/fixtures";
import { getProbeFrame } from "./probe-frame.api";
import {
  clampSliceCenterHeight,
  clampSliceExtent,
  formatSliceExtentMillimeters,
  getContourPolygonPoints,
  getDefaultSliceExtentMillimeters,
  getProbeSlicePlane,
  getQuantizedSizePixels,
  getSlicePixelFromRect,
  getSliceZoomExponentRange
} from "./slice-plane.api";

describe("getProbeSlicePlane", () => {
  it("centers on the given height up the contour from the tip", () => {
    const probe = makeProbe({ tipPosition: [0, 0, 0], rotation: [0, 0, 0] });
    const frame = getProbeFrame(probe, [0, 0, 0]);

    const tipPlane = getProbeSlicePlane(frame, 0, 1, 16);
    const raisedPlane = getProbeSlicePlane(frame, 5, 1, 16);

    // Default rotation [0,0,0]: right = ML (asrToVector3 x), up = DV, so a
    // nonzero center height must shift the plane center along the frame's up
    // axis relative to the tip-centered plane.
    expect(tipPlane.centerMillimeters).not.toEqual(
      raisedPlane.centerMillimeters
    );
    expect(tipPlane.centerMillimeters).toEqual(frame.originMillimeters);
  });

  it("sets halfExtentMillimeters to half the given extent", () => {
    const probe = makeProbe();
    const frame = getProbeFrame(probe, [0, 0, 0]);

    const plane = getProbeSlicePlane(frame, 0, 4, 32);

    expect(plane.halfExtentMillimeters).toBe(2);
    expect(plane.sizePixels).toBe(32);
  });

  it("carries the frame's right and up axes through unchanged", () => {
    const probe = makeProbe({ rotation: [0, 0, Math.PI / 2] });
    const frame = getProbeFrame(probe, [0, 0, 0]);

    const plane = getProbeSlicePlane(frame, 0, 1, 16);

    expect(plane.rightMillimeters).toEqual(frame.rightMillimeters);
    expect(plane.upMillimeters).toEqual(frame.upMillimeters);
  });
});

describe("clampSliceCenterHeight", () => {
  const contour = getProbeContour(
    makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
      ]
    })
  )!;

  it("passes through a value already within the contour's range", () => {
    expect(clampSliceCenterHeight(5, contour)).toBe(5);
  });

  it("clamps a negative value up to the tip", () => {
    expect(clampSliceCenterHeight(-3, contour)).toBe(0);
  });

  it("clamps a value above the contour's top down to the top", () => {
    expect(clampSliceCenterHeight(20, contour)).toBe(contour.heightMillimeters);
  });
});

describe("getSliceZoomExponentRange", () => {
  it("reproduces the Allen-mouse-tuned range for the mouse-scale fixture manifest", () => {
    // makeManifest() defaults to Allen-mouse resolutions/shape (0.025mm/voxel,
    // 528 voxels AP -> a 13.2mm longest dimension), which this formula must
    // continue to map to the range the zoom slider originally shipped with.
    const range = getSliceZoomExponentRange(makeManifest());

    expect(range).toEqual({ minimum: -2, maximum: 4 });
  });

  it("widens for an atlas with a larger longest dimension, e.g. human-scale", () => {
    const range = getSliceZoomExponentRange(
      makeManifest({ resolutions: [[0.5, 0.5, 0.5]], shape: [[394, 394, 394]] })
    );

    // Longest dimension is 197mm; ceil(log2(197)) = 8.
    expect(range).toEqual({ minimum: 2, maximum: 8 });
  });

  it("narrows for an atlas with a smaller longest dimension, e.g. fly-scale", () => {
    const range = getSliceZoomExponentRange(
      makeManifest({
        resolutions: [[0.001, 0.001, 0.001]],
        shape: [[500, 200, 200]]
      })
    );

    // Longest dimension is 0.5mm; ceil(log2(0.5)) = -1.
    expect(range).toEqual({ minimum: -7, maximum: -1 });
  });

  it("falls back to the Allen-mouse-scale range when the manifest is null", () => {
    expect(getSliceZoomExponentRange(null)).toEqual({
      minimum: -2,
      maximum: 4
    });
  });

  it("falls back when the manifest's dimensions are unknown", () => {
    const range = getSliceZoomExponentRange(
      makeManifest({ resolutions: [], shape: [] })
    );

    expect(range).toEqual({ minimum: -2, maximum: 4 });
  });
});

describe("clampSliceExtent", () => {
  const range = { minimum: -2, maximum: 4 };

  it("passes through an extent already within the range", () => {
    expect(clampSliceExtent(2, range)).toBe(2);
  });

  it("clamps an extent below the range's minimum up to it", () => {
    expect(clampSliceExtent(0.001, range)).toBe(2 ** range.minimum);
  });

  it("clamps an extent above the range's maximum down to it", () => {
    expect(clampSliceExtent(1000, range)).toBe(2 ** range.maximum);
  });
});

describe("getDefaultSliceExtentMillimeters", () => {
  it("reproduces the historical 2mm default for the Allen-mouse range", () => {
    expect(getDefaultSliceExtentMillimeters({ minimum: -2, maximum: 4 })).toBe(
      2
    );
  });

  it("scales up for a wider, human-scale range", () => {
    expect(getDefaultSliceExtentMillimeters({ minimum: 2, maximum: 8 })).toBe(
      32
    );
  });

  it("scales down for a narrower, fly-scale range", () => {
    expect(getDefaultSliceExtentMillimeters({ minimum: -7, maximum: -1 })).toBe(
      0.0625
    );
  });
});

describe("getQuantizedSizePixels", () => {
  it("returns 0 when the canvas has no width yet", () => {
    expect(getQuantizedSizePixels(0, 2)).toBe(0);
  });

  it("quantizes device pixels down to the nearest step", () => {
    expect(getQuantizedSizePixels(300, 1)).toBe(288);
  });

  it("clamps below the minimum edge length", () => {
    expect(getQuantizedSizePixels(10, 1)).toBe(128);
  });

  it("clamps above the maximum edge length", () => {
    expect(getQuantizedSizePixels(2000, 1)).toBe(1024);
  });
});

describe("getContourPolygonPoints", () => {
  const contour = getProbeContour(
    makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
      ]
    })
  )!;

  it("re-origins points on the given center height", () => {
    expect(getContourPolygonPoints(contour, 0)).toBe(
      contour.points.map(({ x, y }) => `${x},${-y}`).join(" ")
    );
  });
});

describe("getSlicePixelFromRect", () => {
  const rect = { left: 0, top: 0, width: 16, height: 16 } as DOMRect;

  it("maps a point within the rect to a device pixel", () => {
    expect(getSlicePixelFromRect(rect, 8, 8, 16)).toEqual({ x: 8, y: 8 });
  });

  it("returns null outside the rect", () => {
    expect(getSlicePixelFromRect(rect, -1, 0, 16)).toBeNull();
    expect(getSlicePixelFromRect(rect, 16, 0, 16)).toBeNull();
  });

  it("returns null for a degenerate rect", () => {
    const zeroRect = { left: 0, top: 0, width: 0, height: 0 } as DOMRect;
    expect(getSlicePixelFromRect(zeroRect, 0, 0, 16)).toBeNull();
  });
});

describe("formatSliceExtentMillimeters", () => {
  it("rounds to two significant figures", () => {
    expect(formatSliceExtentMillimeters(2.0001)).toBe("2");
  });

  it("keeps a fractional extent readable", () => {
    expect(formatSliceExtentMillimeters(0.0625)).toBe("0.063");
  });
});
