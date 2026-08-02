import { Matrix, Vector3 } from "@babylonjs/core";
import type { Probe } from "@/features/probe";
import { asrToVector3, vector3ToAsr } from "@/features/scene";

/** A probe's shank plane in atlas ASR millimeters. */
export interface ProbeFrame {
  /** Probe-local origin (the tip) in atlas ASR mm. */
  originMillimeters: [number, number, number];
  /** Unit ASR direction of probe-local +X, across the shanks. */
  rightMillimeters: [number, number, number];
  /** Unit ASR direction of probe-local +Z, up from the tip. */
  upMillimeters: [number, number, number];
}

/**
 * Resolve a probe's shank-plane frame in atlas ASR millimeters.
 *
 * The probe's origin is `referenceCoordinate + tipPosition` elementwise: the
 * reference coordinate node and the probe node are both pure translations
 * using the non-negating `asrToVector3`, and the atlas root's own rotation
 * and center offset are purely presentational, so they never enter this
 * calculation.
 * @param probe Probe to resolve.
 * @param referenceCoordinate Experiment reference coordinate, in atlas ASR mm.
 */
export function getProbeFrame(
  probe: Probe,
  referenceCoordinate: [number, number, number]
): ProbeFrame {
  const [rotationX, rotationY, rotationZ] = asrToVector3(
    probe.rotation
  ).asArray();
  const basis = Matrix.RotationYawPitchRoll(rotationY, rotationX, rotationZ);

  return {
    originMillimeters: [
      referenceCoordinate[0] + probe.tipPosition[0],
      referenceCoordinate[1] + probe.tipPosition[1],
      referenceCoordinate[2] + probe.tipPosition[2]
    ],
    rightMillimeters: vector3ToAsr(
      Vector3.TransformNormal(new Vector3(1, 0, 0), basis)
    ),
    upMillimeters: vector3ToAsr(
      Vector3.TransformNormal(new Vector3(0, 0, 1), basis)
    )
  };
}

/**
 * Map a probe-local (x, y) millimeter point into atlas ASR millimeters.
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
