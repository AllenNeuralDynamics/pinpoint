import { describe, expect, it } from "vitest";
import type { SampleChunkRequest } from "../models/sample-plan.model";
import {
  createSampleResult,
  getSampleAnnotationValue,
  paintSampleChunk
} from "./sample-paint.api";

function makeRequest(
  sampleIndices: number[],
  voxelOffsets: number[]
): SampleChunkRequest {
  return {
    chunkCoordinates: [0, 0, 0],
    sampleIndices: Int32Array.from(sampleIndices),
    voxelOffsets: Int32Array.from(voxelOffsets)
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

describe("paintSampleChunk", () => {
  it("writes the annotation value and color at each sample's index", () => {
    const result = createSampleResult(2, true);
    const chunkData = new Uint32Array([0, 42]);
    const colors = new Map([[42, 0xffcc8811]]);

    paintSampleChunk(result, makeRequest([1], [1]), chunkData, colors);

    expect(result.annotationValues[1]).toBe(42);
    const packedColors = new Uint32Array(result.pixels!.buffer);
    expect(packedColors[1]).toBe(0xffcc8811);
  });

  it("leaves a background sample (value 0) fully transparent", () => {
    const result = createSampleResult(1, true);
    const chunkData = new Uint32Array([0]);

    paintSampleChunk(result, makeRequest([0], [0]), chunkData, new Map());

    expect(result.annotationValues[0]).toBe(0);
    expect(result.pixels![3]).toBe(0);
  });

  it("leaves a value with no matching color transparent, but still records the annotation value", () => {
    const result = createSampleResult(1, true);
    const chunkData = new Uint32Array([7]);

    paintSampleChunk(result, makeRequest([0], [0]), chunkData, new Map());

    expect(result.annotationValues[0]).toBe(7);
    expect(new Uint32Array(result.pixels!.buffer)[0]).toBe(0);
  });

  it("does not allocate or write pixels when withPixels is false", () => {
    const result = createSampleResult(1, false);
    const chunkData = new Uint32Array([42]);

    paintSampleChunk(
      result,
      makeRequest([0], [0]),
      chunkData,
      new Map([[42, 0xffcc8811]])
    );

    expect(result.pixels).toBeNull();
    expect(result.annotationValues[0]).toBe(42);
  });

  it("increments paintedChunkCount by one per call", () => {
    const result = createSampleResult(1, false);

    paintSampleChunk(
      result,
      makeRequest([0], [0]),
      new Uint32Array([0]),
      new Map()
    );
    paintSampleChunk(
      result,
      makeRequest([0], [0]),
      new Uint32Array([0]),
      new Map()
    );

    expect(result.paintedChunkCount).toBe(2);
  });
});

describe("getSampleAnnotationValue", () => {
  it("round-trips a painted value", () => {
    const result = createSampleResult(2, false);
    paintSampleChunk(
      result,
      makeRequest([1], [0]),
      new Uint32Array([99]),
      new Map()
    );

    expect(getSampleAnnotationValue(result, 1)).toBe(99);
  });

  it("returns 0 out of bounds", () => {
    const result = createSampleResult(2, false);

    expect(getSampleAnnotationValue(result, 10)).toBe(0);
    expect(getSampleAnnotationValue(result, -1)).toBe(0);
  });
});
