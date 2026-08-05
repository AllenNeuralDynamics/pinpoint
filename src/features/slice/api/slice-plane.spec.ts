import { describe, expect, it } from "vitest";
import type { ProbeShank } from "@/features/probe";
import { getProbeContour, getProbeShanks } from "@/features/probe";
import {
  makeAtlas,
  makeManifest,
  makeProbe,
  makeProbeInterfaceProbe
} from "@/test/fixtures";
import { getProbeFrame, toAtlasMillimeters } from "./probe-frame.api";
import {
  clampSliceCenterHeight,
  clampSliceExtent,
  formatSliceExtentMillimeters,
  getContactOutlinePath,
  getContourPolygonPoints,
  getDefaultSliceExtentMillimeters,
  getProbeChannelMapWindow,
  getProbeSlicePlane,
  getQuantizedSizePixels,
  getShankLayout,
  getShankOutlinePath,
  getShankSliceGeometry,
  getSlicePixelFromRect,
  getSliceZoomExponentRange,
  setProbeChannelMapWindow
} from "./slice-plane.api";

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

describe("getProbeSlicePlane", () => {
  it("centers on the given height up the contour from the tip", () => {
    const probe = makeProbe({ tipPosition: [0, 0, 0], rotation: [0, 0, 0] });
    const frame = getProbeFrame(probe, [0, 0, 0]);

    const tipPlane = getProbeSlicePlane(frame, 0, 1, 16);
    const raisedPlane = getProbeSlicePlane(frame, 5, 1, 16);

    // Default rotation [0,0,0]: right = ML (asrToVector3 x), up = DV, so a
    // nonzero center height must shift the plane center along the frame's up
    // axis relative to the tip-centered plane.
    expect(tipPlane.bands[0]!.centerMillimeters).not.toEqual(
      raisedPlane.bands[0]!.centerMillimeters
    );
    expect(tipPlane.bands[0]!.centerMillimeters).toEqual(
      frame.originMillimeters
    );
  });

  it("sets the band's and plane's half-extents to half the given extent", () => {
    const probe = makeProbe();
    const frame = getProbeFrame(probe, [0, 0, 0]);

    const plane = getProbeSlicePlane(frame, 0, 4, 32);

    expect(plane.bands[0]!.halfWidthMillimeters).toBe(2);
    expect(plane.halfHeightMillimeters).toBe(2);
    expect(plane.widthPixels).toBe(32);
    expect(plane.heightPixels).toBe(32);
  });

  it("carries the frame's right and up axes through unchanged", () => {
    const probe = makeProbe({ rotation: [0, 0, Math.PI / 2] });
    const frame = getProbeFrame(probe, [0, 0, 0]);

    const plane = getProbeSlicePlane(frame, 0, 1, 16);

    expect(plane.rightMillimeters).toEqual(frame.rightMillimeters);
    expect(plane.upMillimeters).toEqual(frame.upMillimeters);
  });

  it("emits exactly one band spanning the full output width", () => {
    const probe = makeProbe();
    const frame = getProbeFrame(probe, [0, 0, 0]);

    const plane = getProbeSlicePlane(frame, 0, 4, 32);

    expect(plane.bands).toHaveLength(1);
    expect(plane.bands[0]!.columnOffset).toBe(0);
    expect(plane.bands[0]!.columnCount).toBe(32);
  });
});

describe("getShankLayout", () => {
  const twoShankDefinition = makeProbeInterfaceProbe({
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
  const twoShankContour = getProbeContour(twoShankDefinition)!;
  const shanks = getProbeShanks(twoShankDefinition, twoShankContour);

  it("quantizes the height and derives one shared pixels-per-mm scale from it", () => {
    const layout = getShankLayout(
      shanks,
      twoShankContour.heightMillimeters,
      600,
      1
    )!;

    expect(layout.heightPixels).toBe(576);
    expect(layout.pixelsPerMillimeter).toBeCloseTo(57.6, 10);
  });

  it("packs each shank into columns proportional to its width, leaving a 1px gap after each but the last", () => {
    const layout = getShankLayout(
      shanks,
      twoShankContour.heightMillimeters,
      600,
      1
    )!;

    expect(layout.placements.map(p => p.columnCount)).toEqual([6, 6]);
    expect(layout.placements.map(p => p.columnOffset)).toEqual([0, 7]);
    expect(layout.widthPixels).toBe(13);
    expect(layout.widthMillimeters).toBeCloseTo(0.225694, 5);
  });

  it("offsets each shank's probe-local x into packed overlay space", () => {
    const layout = getShankLayout(
      shanks,
      twoShankContour.heightMillimeters,
      600,
      1
    )!;

    expect(layout.placements[0]!.offsetMillimeters).toBeCloseTo(1, 5);
    expect(layout.placements[1]!.offsetMillimeters).toBeCloseTo(-0.778472, 5);
  });

  it("has no gap - and no gap-sized offset - for a single shank", () => {
    const singleShankDefinition = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: [
        [-0.035, 0],
        [0.035, 0],
        [0.035, 10],
        [-0.035, 10]
      ]
    });
    const singleShankContour = getProbeContour(singleShankDefinition)!;
    const singleShanks = getProbeShanks(
      singleShankDefinition,
      singleShankContour
    );

    const layout = getShankLayout(
      singleShanks,
      singleShankContour.heightMillimeters,
      600,
      1
    )!;

    expect(layout.placements).toHaveLength(1);
    expect(layout.widthPixels).toBe(layout.placements[0]!.columnCount);
  });

  it("returns null while unmeasured", () => {
    expect(
      getShankLayout(shanks, twoShankContour.heightMillimeters, 0, 1)
    ).toBeNull();
  });

  it("returns null for no shanks", () => {
    expect(
      getShankLayout([], twoShankContour.heightMillimeters, 600, 1)
    ).toBeNull();
  });
});

describe("getShankSliceGeometry", () => {
  const twoShankDefinition = makeProbeInterfaceProbe({
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
  const twoShankContour = getProbeContour(twoShankDefinition)!;
  const shanks = getProbeShanks(twoShankDefinition, twoShankContour);
  const frame = getProbeFrame(
    makeProbe({ tipPosition: [0, 0, 0], rotation: [0, 0, 0] }),
    [0, 0, 0]
  );

  it("builds one band per shank, centered on its own x and the shared height", () => {
    const layout = getShankLayout(
      shanks,
      twoShankContour.heightMillimeters,
      600,
      1
    )!;

    const geometry = getShankSliceGeometry(
      frame,
      layout,
      { min: 0, max: twoShankContour.heightMillimeters },
      0
    );

    expect(geometry.bands).toHaveLength(2);
    expect(geometry.bands[0]!.centerMillimeters).toEqual(
      toAtlasMillimeters(frame, -0.95, 5)
    );
    expect(geometry.bands[1]!.centerMillimeters).toEqual(
      toAtlasMillimeters(frame, 0.95, 5)
    );
  });

  it("shifts every band center by a non-zero alignment offset", () => {
    const layout = getShankLayout(
      shanks,
      twoShankContour.heightMillimeters,
      600,
      1
    )!;

    const geometry = getShankSliceGeometry(
      frame,
      layout,
      { min: 0, max: twoShankContour.heightMillimeters },
      0.95
    );

    expect(geometry.bands[0]!.centerMillimeters).toEqual(
      toAtlasMillimeters(frame, 0, 5)
    );
    expect(geometry.bands[1]!.centerMillimeters).toEqual(
      toAtlasMillimeters(frame, 1.9, 5)
    );
  });

  it("derives each band's half-width from its column count over the shared scale", () => {
    const layout = getShankLayout(
      shanks,
      twoShankContour.heightMillimeters,
      600,
      1
    )!;

    const geometry = getShankSliceGeometry(
      frame,
      layout,
      { min: 0, max: twoShankContour.heightMillimeters },
      0
    );

    for (const band of geometry.bands) {
      expect(band.halfWidthMillimeters).toBeCloseTo(0.0520833, 5);
    }
  });

  it("carries the frame's right and up axes and the layout's pixel dimensions through", () => {
    const layout = getShankLayout(
      shanks,
      twoShankContour.heightMillimeters,
      600,
      1
    )!;

    const geometry = getShankSliceGeometry(
      frame,
      layout,
      { min: 0, max: twoShankContour.heightMillimeters },
      0
    );

    expect(geometry.rightMillimeters).toEqual(frame.rightMillimeters);
    expect(geometry.upMillimeters).toEqual(frame.upMillimeters);
    expect(geometry.widthPixels).toBe(layout.widthPixels);
    expect(geometry.heightPixels).toBe(layout.heightPixels);
  });

  it("crops to the window's span and centers bands on its midpoint", () => {
    const layout = getShankLayout(
      shanks,
      twoShankContour.heightMillimeters,
      600,
      1
    )!;

    const geometry = getShankSliceGeometry(
      frame,
      layout,
      { min: 2, max: 4 },
      0
    );

    expect(geometry.halfHeightMillimeters).toBe(1);
    expect(geometry.bands[0]!.centerMillimeters).toEqual(
      toAtlasMillimeters(frame, -0.95, 3)
    );
    expect(geometry.bands[1]!.centerMillimeters).toEqual(
      toAtlasMillimeters(frame, 0.95, 3)
    );
    expect(geometry.widthPixels).toBe(layout.widthPixels);
    expect(geometry.heightPixels).toBe(layout.heightPixels);
    for (const band of geometry.bands) {
      expect(band.halfWidthMillimeters).toBeCloseTo(0.0520833, 5);
    }
  });
});

describe("getProbeChannelMapWindow", () => {
  it("defaults an unset window to the full contour height", () => {
    expect(
      getProbeChannelMapWindow(makeProbe({ channelMapWindow: null }), 10)
    ).toEqual({ min: 0, max: 10 });
  });

  it("passes an in-range persisted window through unchanged", () => {
    expect(
      getProbeChannelMapWindow(
        makeProbe({ channelMapWindow: { min: 2, max: 6 } }),
        10
      )
    ).toEqual({ min: 2, max: 6 });
  });

  it("clamps a persisted window that overruns the contour", () => {
    expect(
      getProbeChannelMapWindow(
        makeProbe({ channelMapWindow: { min: -5, max: 99 } }),
        10
      )
    ).toEqual({ min: 0, max: 10 });
  });

  it("pushes a collapsed window's span up to the minimum", () => {
    expect(
      getProbeChannelMapWindow(
        makeProbe({ channelMapWindow: { min: 5, max: 5 } }),
        10
      )
    ).toEqual({ min: 5, max: 5.05 });
  });
});

describe("setProbeChannelMapWindow", () => {
  it("clamps a window that undershoots the tip", () => {
    const probe = makeProbe();
    setProbeChannelMapWindow(probe, { min: -1, max: 3 }, 10);
    expect(probe.channelMapWindow).toEqual({ min: 0, max: 4 });
  });

  it("pushes a window collapsed at the top edge down, not past the top", () => {
    const probe = makeProbe();
    setProbeChannelMapWindow(probe, { min: 10, max: 10 }, 10);
    expect(probe.channelMapWindow).toEqual({ min: 9.95, max: 10 });
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
    // makeAtlas() defaults to Allen-mouse resolutions/shape (0.025mm/voxel,
    // 528 voxels AP -> a 13.2mm longest dimension), which this formula must
    // continue to map to the range the zoom slider originally shipped with.
    const range = getSliceZoomExponentRange(makeAtlas());

    expect(range).toEqual({ minimum: -2, maximum: 4 });
  });

  it("widens for an atlas with a larger longest dimension, e.g. human-scale", () => {
    const range = getSliceZoomExponentRange(
      makeAtlas({
        manifest: makeManifest({
          resolutions: [[0.5, 0.5, 0.5]],
          shape: [[394, 394, 394]]
        })
      })
    );

    // Longest dimension is 197mm; ceil(log2(197)) = 8.
    expect(range).toEqual({ minimum: 2, maximum: 8 });
  });

  it("narrows for an atlas with a smaller longest dimension, e.g. fly-scale", () => {
    const range = getSliceZoomExponentRange(
      makeAtlas({
        manifest: makeManifest({
          resolutions: [[0.001, 0.001, 0.001]],
          shape: [[500, 200, 200]]
        })
      })
    );

    // Longest dimension is 0.5mm; ceil(log2(0.5)) = -1.
    expect(range).toEqual({ minimum: -7, maximum: -1 });
  });

  it("falls back when the atlas's dimensions are unknown", () => {
    const range = getSliceZoomExponentRange(
      makeAtlas({ manifest: makeManifest({ resolutions: [], shape: [] }) })
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
    expect(getContourPolygonPoints(contour, 0, 0)).toBe(
      contour.points.map(({ x, y }) => `${x},${-y}`).join(" ")
    );
  });

  it("shifts every emitted x by the alignment offset and leaves y untouched", () => {
    expect(getContourPolygonPoints(contour, 0, 2.5)).toBe(
      contour.points.map(({ x, y }) => `${x + 2.5},${-y}`).join(" ")
    );
  });
});

describe("getShankOutlinePath", () => {
  it("builds one closed subpath for a shank with one ring", () => {
    const shank: ProbeShank = {
      id: "0",
      rings: [
        [
          { x: -1, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 10 },
          { x: -1, y: 10 }
        ]
      ],
      contacts: [],
      minimumXMillimeters: -1,
      maximumXMillimeters: 1,
      widthMillimeters: 2
    };

    expect(getShankOutlinePath(shank, 0)).toBe("M-1,0L1,0L1,-10L-1,-10Z");
  });

  it("joins two rings' subpaths with a single space", () => {
    const shank: ProbeShank = {
      id: "0",
      rings: [
        [
          { x: -1, y: 0 },
          { x: 1, y: 0 }
        ],
        [
          { x: 2, y: 0 },
          { x: 3, y: 0 }
        ]
      ],
      contacts: [],
      minimumXMillimeters: -1,
      maximumXMillimeters: 3,
      widthMillimeters: 4
    };

    expect(getShankOutlinePath(shank, 0)).toBe("M-1,0L1,0Z M2,0L3,0Z");
  });
});

describe("getContactOutlinePath", () => {
  it("builds one closed polygon subpath, y-flipped about the given center height", () => {
    const path = getContactOutlinePath(
      [
        {
          kind: "polygon",
          shankId: null,
          points: [
            { x: -1, y: 3 },
            { x: -1, y: 5 },
            { x: 1, y: 5 },
            { x: 1, y: 3 }
          ]
        }
      ],
      0
    );

    expect(path).toBe("M-1,-3L-1,-5L1,-5L1,-3Z");
  });

  it("builds one closed circle subpath as two semicircular arcs", () => {
    const path = getContactOutlinePath(
      [
        {
          kind: "circle",
          shankId: null,
          center: { x: 0, y: 4 },
          radiusMillimeters: 2
        }
      ],
      0
    );

    expect(path).toBe("M-2,-4A2,2 0 0,1 2,-4A2,2 0 0,1 -2,-4Z");
  });

  it("joins multiple outlines with a single space", () => {
    const path = getContactOutlinePath(
      [
        {
          kind: "circle",
          shankId: null,
          center: { x: 0, y: 0 },
          radiusMillimeters: 1
        },
        {
          kind: "circle",
          shankId: null,
          center: { x: 2, y: 0 },
          radiusMillimeters: 1
        }
      ],
      0
    );

    expect(path).toBe(
      "M-1,0A1,1 0 0,1 1,0A1,1 0 0,1 -1,0Z M1,0A1,1 0 0,1 3,0A1,1 0 0,1 1,0Z"
    );
  });

  it("returns an empty string for no outlines", () => {
    expect(getContactOutlinePath([], 0)).toBe("");
  });

  it("flips the polygon about a nonzero center height", () => {
    const path = getContactOutlinePath(
      [
        {
          kind: "polygon",
          shankId: null,
          points: [
            { x: -1, y: 3 },
            { x: -1, y: 5 },
            { x: 1, y: 5 },
            { x: 1, y: 3 }
          ]
        }
      ],
      5
    );

    expect(path.startsWith("M-1,2")).toBe(true);
  });
});

describe("getSlicePixelFromRect", () => {
  const rect = { left: 0, top: 0, width: 16, height: 16 } as DOMRect;

  it("maps a point within the rect to a device pixel", () => {
    expect(getSlicePixelFromRect(rect, 8, 8, 16, 16)).toEqual({ x: 8, y: 8 });
  });

  it("returns null outside the rect", () => {
    expect(getSlicePixelFromRect(rect, -1, 0, 16, 16)).toBeNull();
    expect(getSlicePixelFromRect(rect, 16, 0, 16, 16)).toBeNull();
  });

  it("returns null for a degenerate rect", () => {
    const zeroRect = { left: 0, top: 0, width: 0, height: 0 } as DOMRect;
    expect(getSlicePixelFromRect(zeroRect, 0, 0, 16, 16)).toBeNull();
  });

  it("maps independently sized width and height axes", () => {
    const wideRect = { left: 0, top: 0, width: 100, height: 100 } as DOMRect;
    expect(getSlicePixelFromRect(wideRect, 50, 50, 32, 8)).toEqual({
      x: 16,
      y: 4
    });
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
