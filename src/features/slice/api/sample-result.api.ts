import type { SampleResult } from "../models/sample-result.model";

/**
 * Has every chunk of a sampled result been painted, making it safe to show
 * without a partially-empty region.
 * @param result Result to check.
 */
export function isSampleResultComplete(result: SampleResult): boolean {
  return result.paintedChunkCount >= result.totalChunkCount;
}
