import type { SampleResult } from "../models/sample-result.model";

/**
 * Allocate an empty sample result, with all values initialized to background,
 * reusing a previous result's typed arrays when they're already the right size.
 * @param widthPixels Edge length along u, in pixels.
 * @param heightPixels Edge length along v, in pixels.
 * @param reuse Previous result to reuse the typed arrays of, if size-compatible.
 */
export function createSampleResult(
  widthPixels: number,
  heightPixels: number,
  reuse?: SampleResult
): SampleResult {
  const sampleCount = widthPixels * heightPixels;
  if (reuse && reuse.annotationValues.length === sampleCount) {
    reuse.annotationValues.fill(0);
    reuse.pixels.fill(0);
    return {
      widthPixels,
      heightPixels,
      annotationValues: reuse.annotationValues,
      pixels: reuse.pixels,
      packedPixels: reuse.packedPixels,
      imageData: reuse.imageData,
      paintedChunkCount: 0,
      totalChunkCount: 0
    };
  }

  const pixels = new Uint8ClampedArray(sampleCount * 4);
  return {
    widthPixels,
    heightPixels,
    annotationValues: new Uint32Array(sampleCount),
    pixels,
    packedPixels: new Uint32Array(pixels.buffer),
    imageData: new ImageData(pixels, widthPixels, heightPixels),
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
