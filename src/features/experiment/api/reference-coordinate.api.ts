import { getAtlasCenter, Manifest } from "@/features/atlas";

const DEFAULT_REFERENCE_COORDINATE_OVERRIDES: Record<
  string,
  [number, number, number]
> = {
  allen_mouse: [5.7, 0.44, 5.4]
};

/**
 * Compute the initial reference coordinate based on overrides, the atlas center, or some fallback.
 * @param manifest Atlas manifest to build reference coordinate info from.
 */
export function buildInitialReferenceCoordinate(
  manifest: Manifest
): [number, number, number] {
  // Check overrides first.
  const override = DEFAULT_REFERENCE_COORDINATE_OVERRIDES[manifest.atlas.name];
  if (override) return override;

  // Otherwise, just use atlas center.
  return getAtlasCenter(manifest);
}
