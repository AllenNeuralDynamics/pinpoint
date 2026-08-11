import { Vector3 } from "@babylonjs/core";
import { type Atlas, getAtlasCenter } from "@/features/atlas";

/**
 * Axis swap an ASR coordinate (AP, DV, ML) into a Babylon vector (ML, DV, AP).
 * @param coordinate ASR coordinate as [a, s, r].
 */
export function asrToVector3([a, s, r]: [number, number, number]): Vector3 {
  return new Vector3(r, s, a);
}

/**
 * Axis swap a Babylon vector (ML, DV, AP) back into an ASR coordinate.
 * @param vector Babylon vector to convert.
 */
export function vector3ToAsr(vector: Vector3): [number, number, number] {
  return [vector.z, vector.y, vector.x];
}

/**
 * Convert an ASR coordinate to Babylon world space, negating AP and DV.
 * @param coordinate ASR coordinate as [a, s, r].
 */
export function asrToBabylon([a, s, r]: [number, number, number]): Vector3 {
  return new Vector3(r, -s, -a);
}

/**
 * Convert a Babylon world vector back into an ASR coordinate, negating AP and DV.
 * @param vector Babylon vector to convert.
 */
export function babylonToAsr(vector: Vector3): [number, number, number] {
  return [-vector.z, -vector.y, vector.x];
}

/**
 * Convert an atlas ASR coordinate into Babylon world space, matching where the
 * atlas root places its children.
 * @param atlas Atlas whose center anchors world space.
 * @param atlasCoordinate Coordinate relative to the atlas origin, in ASR mm.
 */
export function atlasToWorld(
  atlas: Atlas,
  atlasCoordinate: [number, number, number]
): Vector3 {
  return asrToBabylon(atlasCoordinate).subtractInPlace(
    asrToBabylon(getAtlasCenter(atlas))
  );
}

/**
 * Convert a Babylon world coordinate into atlas ASR mm.
 * @param atlas Atlas whose center anchors world space.
 * @param worldCoordinate Coordinate in Babylon world space.
 */
export function worldToAtlas(
  atlas: Atlas,
  worldCoordinate: Vector3
): [number, number, number] {
  return babylonToAsr(worldCoordinate.add(asrToBabylon(getAtlasCenter(atlas))));
}
