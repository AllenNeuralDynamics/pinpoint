import { describe, expect, it } from "vitest";
import { makeProbe } from "@/test/fixtures";
import type {
  AnatomicalDirection,
  AxisDirections,
  GlobalCoordinateSystem,
  LocalCoordinateSystem
} from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  CANONICAL_AXIS_DIRECTIONS,
  convertCoordinate,
  getAxisDirections,
  getDirectionVector,
  getDownwardProbeRotation
} from "@/utils/coordinate-frame";
import { getProbeFrame, toAtlasMillimeters } from "./probe-frame.api";

/** Default RAS global system: x the animal's right, y anterior, z superior. */
const RAS: GlobalCoordinateSystem = buildDefaultGlobalCoordinateSystem();

/** Axis directions of {@link RAS}, as `getProbeFrame` takes them. */
const RAS_DIRECTIONS: AxisDirections = getAxisDirections(RAS);

/** Default rest: depth posterior, electrodes superior, probe-right on the animal's left. */
const DEFAULT_LOCAL: LocalCoordinateSystem =
  buildDefaultLocalCoordinateSystem();

/**
 * Rest orientation the app hardcoded before coordinate systems were
 * configurable: depth anterior, electrodes superior.
 */
const LEGACY_LOCAL: LocalCoordinateSystem = {
  depthDirection: "Posterior_to_anterior",
  forwardDirection: "Inferior_to_superior"
};

describe("getProbeFrame", () => {
  it("converts the tip out of the global coordinate system into atlas millimeters", () => {
    // RAS [-1, -2, -3] is the animal's-left/posterior/inferior point, which the
    // atlas's AP/SI/ML axes call [2, 3, -1].
    const probe = makeProbe({ tipPosition: [-1, -2, -3] });

    const frame = getProbeFrame(probe, RAS_DIRECTIONS, DEFAULT_LOCAL);

    expect(frame.originMillimeters).toEqual([2, 3, -1]);
  });

  it("leaves the tip alone when the global system is the atlas's own", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3] });

    const frame = getProbeFrame(probe, ATLAS_AXIS_DIRECTIONS, DEFAULT_LOCAL);

    expect(frame.originMillimeters).toEqual([1, 2, 3]);
  });

  it("resolves right and up for an unrotated probe at the default rest", () => {
    // Rest depth is posterior, so the shank runs anterior (atlas -AP) and the
    // probe's right axis points at the animal's left (atlas -ML).
    const probe = makeProbe({ tipPosition: [0, 0, 0], rotation: [0, 0, 0] });

    const frame = getProbeFrame(probe, RAS_DIRECTIONS, DEFAULT_LOCAL);

    expectTriple(frame.rightMillimeters, atlasDirection("Right_to_left"));
    expectTriple(frame.upMillimeters, atlasDirection("Posterior_to_anterior"));
  });

  it("points the shank superior for a probe pitched down from the default rest", () => {
    const probe = makeProbe({
      tipPosition: [0, 0, 0],
      rotation: getDownwardProbeRotation(RAS, DEFAULT_LOCAL)
    });

    const frame = getProbeFrame(probe, RAS_DIRECTIONS, DEFAULT_LOCAL);

    // Tip down: the frame's up axis runs from the tip toward superior, and its
    // right axis still crosses the shanks toward the animal's left.
    expectTriple(frame.upMillimeters, atlasDirection("Inferior_to_superior"));
    expectTriple(frame.rightMillimeters, atlasDirection("Right_to_left"));
  });

  it("reproduces the hardcoded frame for the legacy rest pitched down", () => {
    // Before coordinate systems were configurable, `Matrix.RotationYawPitchRoll`
    // at pitch pi/2 with probe-local +X/+Z produced exactly this plane: across the
    // shanks toward the animal's right, up from the tip toward superior.
    const probe = makeProbe({
      tipPosition: [0, 0, 0],
      rotation: getDownwardProbeRotation(RAS, LEGACY_LOCAL)
    });

    const frame = getProbeFrame(probe, RAS_DIRECTIONS, LEGACY_LOCAL);

    expectTriple(frame.rightMillimeters, atlasDirection("Left_to_right"));
    expectTriple(frame.upMillimeters, atlasDirection("Inferior_to_superior"));
  });

  it("keeps the basis unit-length and orthogonal under an arbitrary rotation", () => {
    const probe = makeProbe({ rotation: [0.3, -0.7, 1.1] });

    const frame = getProbeFrame(probe, RAS_DIRECTIONS, DEFAULT_LOCAL);
    const length = (v: [number, number, number]) => Math.hypot(...v);
    const dot = (a: [number, number, number], b: [number, number, number]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    expect(length(frame.rightMillimeters)).toBeCloseTo(1, 6);
    expect(length(frame.upMillimeters)).toBeCloseTo(1, 6);
    expect(dot(frame.rightMillimeters, frame.upMillimeters)).toBeCloseTo(0, 6);
  });

  it("turns the shank with the rotation about the global system's own axes", () => {
    // A quarter turn about the inferior-superior axis from the default rest
    // swings the anterior-running shank onto the animal's left, i.e. atlas -ML.
    const probe = makeProbe({
      tipPosition: [0, 0, 0],
      rotation: [0, 0, Math.PI / 2]
    });

    const frame = getProbeFrame(probe, RAS_DIRECTIONS, DEFAULT_LOCAL);

    expectTriple(frame.upMillimeters, atlasDirection("Right_to_left"));
  });
});

describe("toAtlasMillimeters", () => {
  it("returns the frame's origin at (0, 0)", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3] });
    const frame = getProbeFrame(probe, RAS_DIRECTIONS, DEFAULT_LOCAL);

    expect(toAtlasMillimeters(frame, 0, 0)).toEqual(frame.originMillimeters);
  });

  it("moves along right and up by the given probe-local offsets", () => {
    const probe = makeProbe({
      tipPosition: [0, 0, 0],
      rotation: getDownwardProbeRotation(RAS, LEGACY_LOCAL)
    });
    const frame = getProbeFrame(probe, RAS_DIRECTIONS, LEGACY_LOCAL);

    const result = toAtlasMillimeters(frame, 2, 3);

    // right = atlas +ML (the animal's right), up = atlas -SI (superior).
    expectTriple(result, [0, -3, 2]);
  });
});

/**
 * Unit atlas-coordinate vector of an anatomical direction, as `getProbeFrame`
 * reports the frame's own axes.
 * @param direction Anatomical direction to convert.
 */
function atlasDirection(
  direction: AnatomicalDirection
): [number, number, number] {
  return convertCoordinate(
    CANONICAL_AXIS_DIRECTIONS,
    ATLAS_AXIS_DIRECTIONS,
    getDirectionVector(direction)
  );
}

/**
 * Assert a triple matches an expected triple within float tolerance.
 * @param actual Triple to check.
 * @param expected Triple to check against.
 */
function expectTriple(
  actual: [number, number, number],
  expected: [number, number, number]
): void {
  for (const [index, value] of expected.entries()) {
    expect(actual[index]).toBeCloseTo(value, 9);
  }
}
