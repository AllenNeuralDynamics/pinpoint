import { Manifest } from "@/features/atlas";

/**
 * Reference coordinate used when an atlas's manifest (and thus its default
 * reference coordinate) can't be fetched.
 */
export const FALLBACK_REFERENCE_COORDINATE: [number, number, number] = [
  0, 0, 0
];

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
  const override = DEFAULT_REFERENCE_COORDINATE_OVERRIDES[manifest.name];
  if (override) return override;

  // Use fallback if manifest does not have resolutions or shape.
  if (!manifest.resolutions[0] || !manifest.shape[0])
    return FALLBACK_REFERENCE_COORDINATE;

  // Otherwise, use atlas center.
  const [apResolution, dvResolution, mlResolution] = manifest.resolutions[0];
  const [apShape, dvShape, mlShape] = manifest.shape[0];
  return [
    (apResolution * apShape) / 2,
    (dvResolution * dvShape) / 2,
    (mlResolution * mlShape) / 2
  ];
}
