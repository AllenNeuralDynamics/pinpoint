import { type Atlas, getAtlasCenter } from "@/features/atlas";

/** Allen Mouse's default reference coordinate, in atlas ASR mm. */
export const ALLEN_MOUSE_REFERENCE_COORDINATE: [number, number, number] = [
  5.7, 0.44, 5.4
];

const DEFAULT_REFERENCE_COORDINATE_OVERRIDES: Record<
  string,
  [number, number, number]
> = {
  allen_mouse: ALLEN_MOUSE_REFERENCE_COORDINATE
};

/**
 * Resolve a coordinate stored relative to the reference coordinate into atlas ASR mm.
 * @param referenceCoordinate Experiment reference coordinate, in atlas ASR mm.
 * @param relativeCoordinate Coordinate relative to the reference coordinate, in ASR mm.
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
 * Express an atlas ASR coordinate relative to the reference coordinate.
 * @param referenceCoordinate Experiment reference coordinate, in atlas ASR mm.
 * @param atlasCoordinate Coordinate relative to the atlas origin, in ASR mm.
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
 * Compute the initial reference coordinate for an atlas, using a known
 * override if one exists, otherwise falling back to the atlas center.
 * @param atlas Atlas to build reference coordinate info from.
 */
export function buildInitialReferenceCoordinate(
  atlas: Atlas
): [number, number, number] {
  const override = DEFAULT_REFERENCE_COORDINATE_OVERRIDES[atlas.name];
  if (override) return [...override];

  return getAtlasCenter(atlas);
}
