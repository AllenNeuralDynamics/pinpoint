import { Matrix, Vector3 } from "@babylonjs/core";
import type { Probe } from "@/features/probe";
import { vector3ToAsr } from "@/features/scene";

/**
 * A probe's shank plane in atlas ASR millimeters. The contacts sit on
 * probe-local -Y (the head-stage cut side); a rendered image looks along
 * that outward normal when its right is probe-local -X and its up is
 * probe-local +Z.
 */
export interface ProbeFrame {
  /** Probe-local origin (the tip) in atlas ASR mm. */
  originMillimeters: [number, number, number];
  /** Unit ASR direction of probe-local +X, across the shanks. */
  rightMillimeters: [number, number, number];
  /** Unit ASR direction of probe-local +Z, up from the tip. */
  upMillimeters: [number, number, number];
}

/** Probe-local +X direction, across the shanks. */
const PROBE_LOCAL_RIGHT = new Vector3(1, 0, 0);

/** Probe-local +Z direction, up from the tip. */
const PROBE_LOCAL_UP = new Vector3(0, 0, 1);

/**
 * Resolve a probe's shank-plane frame in atlas ASR millimeters.
 * @param probe Probe to resolve.
 */
export function getProbeFrame(probe: Probe): ProbeFrame {
  const [roll, yaw, pitch] = probe.rotation;
  const basis = Matrix.RotationYawPitchRoll(yaw, pitch, roll);

  return {
    originMillimeters: [...probe.tipPosition],
    rightMillimeters: vector3ToAsr(
      Vector3.TransformNormal(PROBE_LOCAL_RIGHT, basis)
    ),
    upMillimeters: vector3ToAsr(Vector3.TransformNormal(PROBE_LOCAL_UP, basis))
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
