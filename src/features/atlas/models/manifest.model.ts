/**
 * Aggregated manifest of an atlas across all of its size variants, ordered
 * finest resolution first and index-aligned: `resolutions[i]` and `shape[i]`
 * come from the same size variant.
 */
export interface Manifest {
  name: string;
  resolutions: [number, number, number][];
  shape: [number, number, number][];
}
