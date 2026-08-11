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
 * Compute the initial reference coordinate for an atlas, using a known
 * override if one exists, otherwise the atlas centre in AP and ML at the top
 * of the volume.
 * @param atlas Atlas to build reference coordinate info from.
 */
export function buildInitialReferenceCoordinate(
  atlas: Atlas
): [number, number, number] {
  const override = Object.hasOwn(
    DEFAULT_REFERENCE_COORDINATE_OVERRIDES,
    atlas.name
  )
    ? DEFAULT_REFERENCE_COORDINATE_OVERRIDES[atlas.name]
    : undefined;
  if (override) return [...override];

  const [ap, , ml] = getAtlasCenter(atlas);
  return [ap, 0, ml];
}
