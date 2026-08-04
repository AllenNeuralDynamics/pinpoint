/**
 * One column band of a sampled image: an oriented rectangle that shares the
 * image's up axis and height, mapped onto a contiguous run of output columns.
 */
export interface SampleBand {
  /** Band center, in atlas ASR mm. */
  centerMillimeters: [number, number, number];
  /** Half the band's u extent, in mm. */
  halfWidthMillimeters: number;
  /** First output column this band fills, inclusive. */
  columnOffset: number;
  /** Output columns this band fills. */
  columnCount: number;
}

/**
 * An oriented sampling surface through the annotation volume, sampled
 * row-major with row 0 at the +up edge. Horizontally it is one or more bands
 * arranged left to right across `widthPixels`, possibly with unsampled gaps
 * between them; a one-band geometry with no gap is a plain rectangle, and a
 * square is additionally `halfHeightMillimeters === bands[0].halfWidthMillimeters`
 * with `heightPixels === widthPixels`.
 */
export interface SampleGeometry {
  /** Unit ASR direction of the +u (rightward) axis, shared by every band. */
  rightMillimeters: [number, number, number];
  /** Unit ASR direction of the +v (upward) axis, shared by every band. */
  upMillimeters: [number, number, number];
  /** Half the v extent, in mm, shared by every band. */
  halfHeightMillimeters: number;
  /** Total edge length of the output along u, in pixels - at least the sum of every band's `columnCount`, more if bands leave gaps between them. */
  widthPixels: number;
  /** Edge length of the output along v, in pixels. */
  heightPixels: number;
  /** Bands left to right, starting at columnOffset 0; consecutive bands may leave an unsampled gap between them. */
  bands: SampleBand[];
}
