import type { Probe } from "@/features/probe";
import type {
  AxisDirections,
  LocalCoordinateSystem,
  Matrix3
} from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  CANONICAL_AXIS_DIRECTIONS,
  convertCoordinate,
  getProbeRestRotation,
  getRotationMatrix,
  multiplyMatrices,
  transformVector
} from "@/utils/coordinate-frame";

/**
 * A probe's shank plane in atlas millimeters. The contacts sit on
 * probe-local -Y (the head-stage cut side); a rendered image looks along
 * that outward normal when its right is probe-local -X and its up is
 * probe-local +Z.
 */
export interface ProbeFrame {
  /** Probe-local origin (the tip) in atlas millimeters. */
  originMillimeters: [number, number, number];
  /** Unit atlas direction of probe-local +X, across the shanks. */
  rightMillimeters: [number, number, number];
  /** Unit atlas direction of probe-local +Z, up from the tip. */
  upMillimeters: [number, number, number];
}

/**
 * Resolve a probe's shank-plane frame in atlas millimeters from its body
 * orientation: its rest-relative rotation applied to the orientation its local
 * coordinate system rests it in.
 * @param probe Probe to resolve.
 * @param globalDirections Axis directions the probe's tip and rotation are in.
 * @param localCoordinateSystem Orientation the probe rests in.
 */
export function getProbeFrame(
  probe: Probe,
  globalDirections: AxisDirections,
  localCoordinateSystem: LocalCoordinateSystem
): ProbeFrame {
  const orientation = multiplyMatrices(
    getRotationMatrix(globalDirections, probe.rotation),
    getProbeRestRotation(localCoordinateSystem)
  );

  return {
    originMillimeters: convertCoordinate(
      globalDirections,
      ATLAS_AXIS_DIRECTIONS,
      probe.tipPosition
    ),
    rightMillimeters: getBodyAxisMillimeters(orientation, [1, 0, 0]),
    upMillimeters: getBodyAxisMillimeters(orientation, [0, 0, 1])
  };
}

/**
 * Map a probe-local (x, y) millimeter point into atlas millimeters.
 * @param frame Frame to map through.
 * @param x Probe-local x, across the shanks, in mm.
 * @param y Probe-local y, up from the tip, in mm.
 */
export function toAtlasMillimeters(
  frame: ProbeFrame,
  x: number,
  y: number
): [number, number, number] {
  return [
    frame.originMillimeters[0] +
      frame.rightMillimeters[0] * x +
      frame.upMillimeters[0] * y,
    frame.originMillimeters[1] +
      frame.rightMillimeters[1] * x +
      frame.upMillimeters[1] * y,
    frame.originMillimeters[2] +
      frame.rightMillimeters[2] * x +
      frame.upMillimeters[2] * y
  ];
}

/**
 * Unit atlas direction one of a probe body's own axes points.
 * @param orientation Probe body orientation, in canonical anatomical coordinates.
 * @param bodyAxis Unit vector of the body axis to resolve, in body coordinates.
 */
function getBodyAxisMillimeters(
  orientation: Matrix3,
  bodyAxis: [number, number, number]
): [number, number, number] {
  return convertCoordinate(
    CANONICAL_AXIS_DIRECTIONS,
    ATLAS_AXIS_DIRECTIONS,
    transformVector(orientation, bodyAxis)
  );
}
