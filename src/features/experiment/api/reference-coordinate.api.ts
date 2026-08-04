import type { Manifest } from "@/features/atlas";
import { getAtlasCenter } from "@/features/atlas";

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
 * override if one exists, otherwise falling back to the atlas center.
 * @param manifest Atlas manifest to build reference coordinate info from.
 */
export function buildInitialReferenceCoordinate(
  manifest: Manifest
): [number, number, number] {
  const override = DEFAULT_REFERENCE_COORDINATE_OVERRIDES[manifest.atlas.name];
  if (override) return [...override];

  return getAtlasCenter(manifest);
}
