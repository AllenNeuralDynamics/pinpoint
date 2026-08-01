/** A sampled geometry: annotation values, and optionally colors for display. */
export interface SampleResult {
  sampleCount: number;
  /** Annotation value per sample; 0 is background or not yet painted. */
  annotationValues: Uint32Array;
  /**
   * RGBA8 pixels, row 0 at the top of a plane, or null when the consumer only
   * wants annotation values (a 1D channel map does not need colors).
   */
  pixels: Uint8ClampedArray | null;
  paintedChunkCount: number;
  totalChunkCount: number;
}
