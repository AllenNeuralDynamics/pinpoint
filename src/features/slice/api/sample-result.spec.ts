import { describe, expect, it } from "vitest";
import type { SampleResult } from "../models/sample-result.model";
import { isSampleResultComplete } from "./sample-result.api";

function makeResult(overrides: Partial<SampleResult> = {}): SampleResult {
  return {
    sampleCount: 4,
    annotationValues: new Uint32Array(4),
    pixels: new Uint8ClampedArray(16),
    paintedChunkCount: 0,
    totalChunkCount: 0,
    ...overrides
  };
}

describe("isSampleResultComplete", () => {
  it("is true when every chunk has been painted", () => {
    const result = makeResult({ paintedChunkCount: 3, totalChunkCount: 3 });
    expect(isSampleResultComplete(result)).toBe(true);
  });

  it("is false when some chunks are still outstanding", () => {
    const result = makeResult({ paintedChunkCount: 1, totalChunkCount: 3 });
    expect(isSampleResultComplete(result)).toBe(false);
  });

  it("is true for a plane with no chunks to paint at all", () => {
    const result = makeResult({ paintedChunkCount: 0, totalChunkCount: 0 });
    expect(isSampleResultComplete(result)).toBe(true);
  });
});
