/** A sampled geometry: annotation values and their RGBA8 colors. */
export interface SampleResult {
  /** Edge length along u, in pixels. */
  widthPixels: number;
  /** Edge length along v, in pixels. */
  heightPixels: number;
  /** Annotation value per sample; 0 is background or not yet painted. */
  annotationValues: Uint32Array;
  /** RGBA8 pixels, row 0 at the top. */
  pixels: Uint8ClampedArray<ArrayBuffer>;
  paintedChunkCount: number;
  totalChunkCount: number;
}
