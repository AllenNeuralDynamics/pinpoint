import { describe, expect, it } from "vitest";
import type { SampleResult } from "../models/sample-result.model";
import {
  createSampleResult,
  getSampleEdgeLength,
  isSampleResultComplete
} from "./sample-result.api";

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

describe("createSampleResult", () => {
  it("allocates a pixel buffer when withPixels is true", () => {
    const result = createSampleResult(4, true);

    expect(result.pixels).not.toBeNull();
    expect(result.pixels).toHaveLength(16);
    expect(result.annotationValues).toHaveLength(4);
  });

  it("allocates no pixel buffer when withPixels is false", () => {
    const result = createSampleResult(4, false);

    expect(result.pixels).toBeNull();
    expect(result.annotationValues).toHaveLength(4);
  });
});

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

describe("getSampleEdgeLength", () => {
  it("recovers the edge length of a square result", () => {
    const result = makeResult({ sampleCount: 256 * 256 });
    expect(getSampleEdgeLength(result)).toBe(256);
  });
});
