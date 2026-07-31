import { Vector3 } from "@babylonjs/core";

/**
 * Convert an ASR coordinate (AP, DV, ML, in mm) to Babylon world space.
 * @param coordinate ASR coordinate as [a, s, r].
 */
export function asrToBabylon([a, s, r]: [number, number, number]): Vector3 {
  return new Vector3(r, -s, -a);
}

/**
 * Convert a Babylon world-space vector back to an ASR coordinate (AP, DV, ML).
 * Inverse of {@link asrToBabylon}.
 * @param vector Babylon world position.
 */
export function babylonToAsr(vector: Vector3): [number, number, number] {
  return [-vector.z, -vector.y, vector.x];
}

/**
 * Axis swap an ASR coordinate (AP, DV, ML) to a Vector 3 (ML, DV, AP)
 * @param coordinate ASR coordinate as [a, s, r].
 */
export function asrToVector3([a, s, r]: [number, number, number]): Vector3 {
  return new Vector3(r, s, a);
}

/**
 * Axis swap a Vector 3 (ML, DV, AP) into an ASR coordinate (AP, DV, ML).
 * @param vector Vector 3 coordinates.
 */
export function vector3ToAsr(vector: Vector3): [number, number, number] {
  return [vector.z, vector.y, vector.x];
}
