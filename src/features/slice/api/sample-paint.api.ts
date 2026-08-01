import type { SampleChunkRequest } from "../models/sample-plan.model";
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
 * Paint one chunk's samples into a result. Mutates `result`.
 * @param result Result to paint into.
 * @param request Pixel-to-voxel mapping for this chunk.
 * @param chunkData Chunk voxels, flat in [ap, dv, ml] order.
 * @param colors Annotation value to packed-color lookup.
 */
export function paintSampleChunk(
  result: SampleResult,
  request: SampleChunkRequest,
  chunkData: Uint32Array,
  colors: Map<number, number>
): void {
  const { sampleIndices, voxelOffsets } = request;
  const packedColors = result.pixels
    ? new Uint32Array(result.pixels.buffer)
    : null;

  for (let index = 0; index < sampleIndices.length; index++) {
    const value = chunkData[voxelOffsets[index]!];
    // Background stays transparent, which also keeps not-yet-streamed
    // samples visually distinct from painted background during progressive
    // fill.
    if (!value) continue;

    const sampleIndex = sampleIndices[index]!;
    result.annotationValues[sampleIndex] = value;
    if (packedColors) packedColors[sampleIndex] = colors.get(value) ?? 0;
  }

  result.paintedChunkCount += 1;
}

/**
 * Annotation value at a sample, or 0 when out of bounds or background.
 * @param result Result to read.
 * @param index Sample index.
 */
export function getSampleAnnotationValue(
  result: SampleResult,
  index: number
): number {
  return result.annotationValues[index] ?? 0;
}
