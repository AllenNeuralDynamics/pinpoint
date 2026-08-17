import { type Atlas, getAtlasCenter } from "@/features/atlas";
import {
  ATLAS_AXIS_DIRECTIONS,
  convertCoordinate,
  getAxisDirections,
  type GlobalCoordinateSystem
} from "@/utils/coordinate-frame";

/** Allen Mouse's default reference coordinate, in atlas millimeters. */
export const ALLEN_MOUSE_REFERENCE_COORDINATE: [number, number, number] = [
  5.4, 0.33, 5.7
];

const DEFAULT_REFERENCE_COORDINATE_OVERRIDES: Record<
  string,
  [number, number, number]
> = {
  allen_mouse: ALLEN_MOUSE_REFERENCE_COORDINATE
};

/**
 * Resolve a coordinate stored relative to the reference coordinate into
 * coordinates relative to the atlas origin.
 * @param referenceCoordinate Experiment reference coordinate.
 * @param relativeCoordinate Coordinate relative to the reference coordinate, in the same frame.
 */
export function referenceRelativeToAtlas(
  referenceCoordinate: [number, number, number],
  relativeCoordinate: [number, number, number]
): [number, number, number] {
  return [
    referenceCoordinate[0] + relativeCoordinate[0],
    referenceCoordinate[1] + relativeCoordinate[1],
    referenceCoordinate[2] + relativeCoordinate[2]
  ];
}

/**
 * Express a coordinate relative to the atlas origin relative to the reference
 * coordinate instead.
 * @param referenceCoordinate Experiment reference coordinate.
 * @param atlasCoordinate Coordinate relative to the atlas origin, in the same frame.
 */
export function atlasToReferenceRelative(
  referenceCoordinate: [number, number, number],
  atlasCoordinate: [number, number, number]
): [number, number, number] {
  return [
    atlasCoordinate[0] - referenceCoordinate[0],
    atlasCoordinate[1] - referenceCoordinate[1],
    atlasCoordinate[2] - referenceCoordinate[2]
  ];
}

/**
 * Compute the initial reference coordinate for an atlas, preferring the
 * manifest's bregma, then a known override, otherwise the top of the atlas
 * center, expressed in the given coordinate system.
 * @param atlas Atlas to build reference coordinate info from.
 * @param globalCoordinateSystem Coordinate system to express the result in.
 */
export function buildInitialReferenceCoordinate(
  atlas: Atlas,
  globalCoordinateSystem: GlobalCoordinateSystem
): [number, number, number] {
  const [ap, , ml] = getAtlasCenter(atlas);
  const atlasCoordinate = atlas.manifest.bregma ??
    DEFAULT_REFERENCE_COORDINATE_OVERRIDES[atlas.name] ?? [ap, 0, ml];

  return convertCoordinate(
    ATLAS_AXIS_DIRECTIONS,
    getAxisDirections(globalCoordinateSystem),
    atlasCoordinate
  );
}
