/**
 * Aggregated manifest of an atlas across all of its size variants, ordered
 * finest resolution first and index-aligned: `resolutions[i]` and `shape[i]`
 * come from the same size variant.
 */
export interface Manifest {
  /**
   * Source-root-relative location of the atlas's terminology, taken from the
   * manifest JSON's `terminology.location` field, e.g.
   * `/terminologies/allen_mouse-terminology/3_0`.
   */
  terminologyLocation: string;
  /**
   * Source-root-relative location of the atlas's annotation set, taken from
   * the manifest JSON's `annotation_set.location` field, e.g.
   * `/annotation-sets/allen_mouse-annotation/3_0`.
   */
  annotationSetLocation: string;
  /**
   * External page for the atlas, from the manifest JSON's `atlas_link` field
   * (e.g. `http://www.brain-map.org`), or null when the source omits it.
   */
  atlasLink: string | null;
  resolutions: [number, number, number][];
  shape: [number, number, number][];
}
