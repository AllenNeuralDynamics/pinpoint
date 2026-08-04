import { describe, expect, it } from "vitest";
import type { ProbeInterfaceProbe } from "../models/probe-interface.model";
import { makeProbeInterfaceProbe } from "@/test/fixtures";
import { getProbeContactOutlines, getProbeContour } from "./contour.api";

/** Single-shank contour (imec NP1000), in micrometers. */
const NP1000_CONTOUR = [
  [-11, 9989],
  [-11, -11],
  [24, -220],
  [59, -11],
  [59, 9989]
];

describe("getProbeContour", () => {
  it("returns null when there's no contour", () => {
    const result = getProbeContour(makeProbeInterfaceProbe());

    expect(result).toBeNull();
  });

  it("returns null when fewer than 3 points are usable", () => {
    const result = getProbeContour(
      makeProbeInterfaceProbe({
        probe_planar_contour: [
          [0, 0],
          [1, 1]
        ]
      })
    );

    expect(result).toBeNull();
  });

  it("drops non-finite points before checking the minimum point count", () => {
    const result = getProbeContour(
      makeProbeInterfaceProbe({
        probe_planar_contour: [
          [0, 0],
          [1, 1],
          [2, 2],
          [Number.NaN, 3],
          [Number.POSITIVE_INFINITY, 4]
        ]
      })
    );

    expect(result?.points).toHaveLength(3);
  });

  it("scales points to millimeters", () => {
    const result = getProbeContour(
      makeProbeInterfaceProbe({
        si_units: "um",
        probe_planar_contour: NP1000_CONTOUR
      })
    );

    expect(result?.widthMillimeters).toBeCloseTo(0.07, 6);
    expect(result?.heightMillimeters).toBeCloseTo(10.209, 6);
  });

  it("centers x on the bounding box center and zeroes y at the tip", () => {
    const result = getProbeContour(
      makeProbeInterfaceProbe({
        si_units: "mm",
        probe_planar_contour: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10]
        ]
      })
    );

    // Bounding box center x = 5, tip (minimum y) = 0.
    expect(result?.points).toEqual([
      { x: -5, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 10 },
      { x: -5, y: 10 }
    ]);
    expect(result?.origin).toEqual({ x: 5, y: 0 });
  });

  it("respects si_units when scaling", () => {
    const result = getProbeContour(
      makeProbeInterfaceProbe({
        si_units: "mm",
        probe_planar_contour: [
          [0, 0],
          [10, 0],
          [5, 10]
        ]
      })
    );

    expect(result?.widthMillimeters).toBe(10);
    expect(result?.heightMillimeters).toBe(10);
  });

  it("converts si_units meters to millimeters", () => {
    const result = getProbeContour(
      makeProbeInterfaceProbe({
        si_units: "m",
        probe_planar_contour: [
          [0, 0],
          [10, 0],
          [5, 10]
        ]
      })
    );

    expect(result?.widthMillimeters).toBe(10000);
    expect(result?.heightMillimeters).toBe(10000);
  });

  it("converts si_units micrometers to millimeters", () => {
    const result = getProbeContour(
      makeProbeInterfaceProbe({
        si_units: "um",
        probe_planar_contour: [
          [0, 0],
          [10, 0],
          [5, 10]
        ]
      })
    );

    expect(result?.widthMillimeters).toBeCloseTo(0.01, 6);
    expect(result?.heightMillimeters).toBeCloseTo(0.01, 6);
  });

  it("falls back to micrometers for an unrecognized si_units value", () => {
    const result = getProbeContour(
      makeProbeInterfaceProbe({
        si_units: "furlongs",
        probe_planar_contour: [
          [0, 0],
          [10, 0],
          [5, 10]
        ]
      })
    );

    expect(result?.widthMillimeters).toBeCloseTo(0.01, 6);
    expect(result?.heightMillimeters).toBeCloseTo(0.01, 6);
  });
});

describe("getProbeContactOutlines", () => {
  const ORIGIN = { x: 0, y: 0 };

  it("builds a square outline from contact_shapes: square", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [[0, 4]],
        contact_shapes: ["square"],
        contact_shape_params: [{ width: 2 }]
      }),
      ORIGIN
    );

    expect(result).toEqual([
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
    ]);
  });

  it("builds a rectangle outline from contact_shapes: rect", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [[0, 4]],
        contact_shapes: ["rect"],
        contact_shape_params: [{ width: 2, height: 4 }]
      }),
      ORIGIN
    );

    expect(result).toEqual([
      {
        kind: "polygon",
        shankId: null,
        points: [
          { x: -1, y: 2 },
          { x: -1, y: 6 },
          { x: 1, y: 6 },
          { x: 1, y: 2 }
        ]
      }
    ]);
  });

  it("builds a circle outline from contact_shapes: circle", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [[0, 4]],
        contact_shapes: ["circle"],
        contact_shape_params: [{ radius: 2 }]
      }),
      ORIGIN
    );

    expect(result).toEqual([
      {
        kind: "circle",
        shankId: null,
        center: { x: 0, y: 4 },
        radiusMillimeters: 2
      }
    ]);
  });

  it("rotates a square's vertices by contact_plane_axes", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [[0, 4]],
        contact_shapes: ["square"],
        contact_shape_params: [{ width: 2 }],
        contact_plane_axes: [
          [
            [0, 1],
            [-1, 0]
          ]
        ]
      }),
      ORIGIN
    );

    expect(result).toEqual([
      {
        kind: "polygon",
        shankId: null,
        points: [
          { x: 1, y: 3 },
          { x: -1, y: 3 },
          { x: -1, y: 5 },
          { x: 1, y: 5 }
        ]
      }
    ]);
  });

  it("falls back to a 5-unit square when contact_shapes is missing", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [[0, 4]]
      }),
      ORIGIN
    );

    expect(result).toEqual([
      {
        kind: "polygon",
        shankId: null,
        points: [
          { x: -2.5, y: 1.5 },
          { x: -2.5, y: 6.5 },
          { x: 2.5, y: 6.5 },
          { x: 2.5, y: 1.5 }
        ]
      }
    ]);
  });

  it("falls back to a 5-unit square for an unknown shape string", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [[0, 4]],
        contact_shapes: ["hexagon"]
      }),
      ORIGIN
    );

    expect(result).toEqual([
      {
        kind: "polygon",
        shankId: null,
        points: [
          { x: -2.5, y: 1.5 },
          { x: -2.5, y: 6.5 },
          { x: 2.5, y: 6.5 },
          { x: 2.5, y: 1.5 }
        ]
      }
    ]);
  });

  it("falls back to a 5-unit square for square shape with no shape params", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [[0, 4]],
        contact_shapes: ["square"]
      }),
      ORIGIN
    );

    expect(result).toEqual([
      {
        kind: "polygon",
        shankId: null,
        points: [
          { x: -2.5, y: 1.5 },
          { x: -2.5, y: 6.5 },
          { x: 2.5, y: 6.5 },
          { x: 2.5, y: 1.5 }
        ]
      }
    ]);
  });

  it("drops non-finite contact positions", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [
          [0, 4],
          [Number.NaN, 1]
        ]
      }),
      ORIGIN
    );

    expect(result).toHaveLength(1);
  });

  it("passes shankId through from shank_ids, index-aligned after an unusable position is dropped", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [
          [0, 4],
          [Number.NaN, 1],
          [1, 4]
        ],
        shank_ids: [0, 1, 2]
      }),
      ORIGIN
    );

    expect(result.map(outline => outline.shankId)).toEqual([0, 2]);
  });

  it("returns an empty array when contact_positions is absent", () => {
    const definition: Partial<ProbeInterfaceProbe> = makeProbeInterfaceProbe();
    delete definition.contact_positions;

    expect(
      getProbeContactOutlines(definition as ProbeInterfaceProbe, ORIGIN)
    ).toEqual([]);
  });

  it("subtracts the given origin from every vertex", () => {
    const result = getProbeContactOutlines(
      makeProbeInterfaceProbe({
        si_units: "mm",
        contact_positions: [[0, 4]],
        contact_shapes: ["square"],
        contact_shape_params: [{ width: 2 }]
      }),
      { x: 1, y: 2 }
    );

    expect(result).toEqual([
      {
        kind: "polygon",
        shankId: null,
        points: [
          { x: -2, y: 1 },
          { x: -2, y: 3 },
          { x: 0, y: 3 },
          { x: 0, y: 1 }
        ]
      }
    ]);
  });
});
