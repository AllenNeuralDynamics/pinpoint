import { describe, expect, it } from "vitest";
import type { SampleResult } from "../models/sample-result.model";
import {
  createSampleResult,
  isSampleResultComplete
} from "./sample-result.api";

function makeResult(overrides: Partial<SampleResult> = {}): SampleResult {
  const pixels = new Uint8ClampedArray(16);
  return {
    widthPixels: 2,
    heightPixels: 2,
    annotationValues: new Uint32Array(4),
    pixels,
    packedPixels: new Uint32Array(pixels.buffer),
    imageData: new ImageData(pixels, 2, 2),
    paintedChunkCount: 0,
    totalChunkCount: 0,
    ...overrides
  };
}

describe("createSampleResult", () => {
  it("allocates typed arrays sized to the given rectangle", () => {
    const result = createSampleResult(4, 2);

    expect(result.annotationValues.length).toBe(8);
    expect(result.pixels.length).toBe(32);
  });

  it("reuses a previous result's typed arrays when the size matches", () => {
    const previous = createSampleResult(4, 2);
    previous.annotationValues.fill(9);

    const result = createSampleResult(4, 2, previous);

    expect(result).not.toBe(previous);
    expect(result.annotationValues).toBe(previous.annotationValues);
    expect(result.pixels).toBe(previous.pixels);
    expect(Array.from(result.annotationValues).every(v => v === 0)).toBe(true);
  });

  it("allocates fresh arrays when the size changes", () => {
    const previous = createSampleResult(4, 2);

    const result = createSampleResult(4, 3, previous);

    expect(result.annotationValues).not.toBe(previous.annotationValues);
    expect(result.pixels).not.toBe(previous.pixels);
    expect(result.annotationValues.length).toBe(12);
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

  it("is true for a rectangle with no chunks to paint at all", () => {
    const result = makeResult({ paintedChunkCount: 0, totalChunkCount: 0 });
    expect(isSampleResultComplete(result)).toBe(true);
  });
});
