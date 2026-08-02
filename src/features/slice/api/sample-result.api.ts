import type { SampleResult } from "../models/sample-result.model";

/**
 * Allocate an empty sample result, with all values initialized to background.
 * @param sampleCount Number of samples the result will hold.
 * @param withPixels Whether to also allocate RGBA8 pixels (skip for a 1D
 *   consumer that only needs annotation values).
 */
export function createSampleResult(
  sampleCount: number,
  withPixels: boolean
): SampleResult {
  return {
    sampleCount,
    annotationValues: new Uint32Array(sampleCount),
    pixels: withPixels ? new Uint8ClampedArray(sampleCount * 4) : null,
    paintedChunkCount: 0,
    totalChunkCount: 0
  };
}

/**
 * Has every chunk of a sampled result been painted, making it safe to show
 * without a partially-empty region.
 * @param result Result to check.
 */
export function isSampleResultComplete(result: SampleResult): boolean {
  return result.paintedChunkCount >= result.totalChunkCount;
}

/**
 * Edge length in samples of a square result, recovered from its sample count.
 * @param result Result to measure.
 */
export function getSampleEdgeLength(result: SampleResult): number {
  return Math.round(Math.sqrt(result.sampleCount));
}
