import { describe, expect, it } from "vitest";
import type { Array as ZarrArray, DataType, Readable } from "zarrita";
import type {
  AnnotationLevel,
  AnnotationVolume
} from "../models/annotation-level.model";
import type {
  LineGeometry,
  PlaneGeometry
} from "../models/sample-geometry.model";
import {
  countSampleChunks,
  planSamples,
  selectAnnotationLevelIndex
} from "./sample-plan.api";

/**
 * Build a fake multiscale level for planning tests. `array` is never read by
 * the planner, so a stub satisfies the type without a real zarr store.
 */
function makeAnnotationLevel(
  overrides: Partial<AnnotationLevel> = {}
): AnnotationLevel {
  return {
    path: "s0",
    array: {} as unknown as ZarrArray<DataType, Readable>,
    shapeVoxels: [100, 100, 100],
    chunkShapeVoxels: [10, 10, 10],
    scaleMillimeters: [0.01, 0.01, 0.01],
    translationMillimeters: [0, 0, 0],
    ...overrides
  };
}

function makePlane(overrides: Partial<PlaneGeometry> = {}): PlaneGeometry {
  return {
    kind: "plane",
    centerMillimeters: [0.5, 0.5, 0.5],
    rightMillimeters: [0, 0, 1],
    upMillimeters: [0, -1, 0],
    halfExtentMillimeters: 0.1,
    sizePixels: 4,
    ...overrides
  };
}

function makeLine(overrides: Partial<LineGeometry> = {}): LineGeometry {
  return {
    kind: "line",
    originMillimeters: [0.5, 0.5, 0.4],
    directionMillimeters: [0, 0, 1],
    lengthMillimeters: 0.2,
    sampleCount: 4,
    ...overrides
  };
}

describe("planSamples", () => {
  it("buckets every in-bounds sample under its chunk, with no sample lost or duplicated", () => {
    const level = makeAnnotationLevel();
    const plane = makePlane();

    const plan = planSamples(plane, level, 0);

    const seen = new Set<number>();
    for (const request of plan.chunkRequests) {
      for (const index of request.sampleIndices) {
        expect(seen.has(index)).toBe(false);
        seen.add(index);
      }
    }
    expect(seen.size).toBeLessThanOrEqual(plan.sampleCount);
    expect(plan.sampleCount).toBe(plane.sizePixels * plane.sizePixels);
  });

  it("resolves the exact chunk and voxel offset for a known axis-aligned plane", () => {
    // 1 chunk = 10^3 voxels, scale 0.01mm/voxel -> chunk = 0.1mm cube.
    // Center (0.05, 0.05, 0.05) is voxel (5,5,5), the center of chunk (0,0,0).
    const level = makeAnnotationLevel();
    const plane = makePlane({
      centerMillimeters: [0.05, 0.05, 0.05],
      rightMillimeters: [0, 0, 1],
      upMillimeters: [0, -1, 0],
      halfExtentMillimeters: 0.005,
      sizePixels: 1
    });

    const plan = planSamples(plane, level, 0);

    expect(plan.chunkRequests).toHaveLength(1);
    expect(plan.chunkRequests[0]!.chunkCoordinates).toEqual([0, 0, 0]);
    // voxel (5,5,5) local to a 10^3 chunk -> offset (5*10+5)*10+5 = 555.
    expect(plan.chunkRequests[0]!.voxelOffsets[0]).toBe(555);
  });

  it("puts row 0 at the +up edge of the plane", () => {
    // up = -DV (superior). Row 0 should read the smallest DV (most superior)
    // voxel, row (size-1) the largest DV voxel.
    const level = makeAnnotationLevel({
      shapeVoxels: [100, 100, 100],
      chunkShapeVoxels: [10, 10, 10]
    });
    const plane = makePlane({
      centerMillimeters: [0.5, 0.5, 0.5],
      rightMillimeters: [0, 0, 1],
      upMillimeters: [0, -1, 0],
      halfExtentMillimeters: 0.45,
      sizePixels: 2
    });

    const plan = planSamples(plane, level, 0);

    const chunkOfRow = (row: number) => {
      const index = row * plane.sizePixels;
      const request = plan.chunkRequests.find(r =>
        r.sampleIndices.includes(index)
      );
      return request?.chunkCoordinates[1];
    };

    expect(chunkOfRow(0)).toBeLessThan(chunkOfRow(1)!);
  });

  it("drops samples that fall outside the volume", () => {
    const level = makeAnnotationLevel({ shapeVoxels: [10, 10, 10] });
    const plane = makePlane({
      centerMillimeters: [0, 0, 0],
      halfExtentMillimeters: 1,
      sizePixels: 4
    });

    const plan = planSamples(plane, level, 0);

    const totalBucketed = plan.chunkRequests.reduce(
      (sum, request) => sum + request.sampleIndices.length,
      0
    );
    expect(totalBucketed).toBeLessThan(plan.sampleCount);
  });

  it("indexes each axis by its own anisotropic scale", () => {
    const level = makeAnnotationLevel({
      shapeVoxels: [100, 100, 100],
      chunkShapeVoxels: [100, 100, 100],
      scaleMillimeters: [0.02, 0.01, 0.005]
    });
    // A point 1 voxel off-center on each axis, in mm, using that axis's scale.
    const plane = makePlane({
      centerMillimeters: [0.02, 0.01, 0.005],
      halfExtentMillimeters: 0.0001,
      sizePixels: 1
    });

    const plan = planSamples(plane, level, 0);

    // Voxel (1, 1, 1) in a single 100^3 chunk -> offset (1*100+1)*100+1 = 10101.
    expect(plan.chunkRequests[0]!.voxelOffsets[0]).toBe(10101);
  });

  it("shifts the sampled voxel by a non-zero translation", () => {
    const level = makeAnnotationLevel({
      translationMillimeters: [0.03, 0, 0]
    });
    // Without the translation this would resolve to voxel 5; with it, voxel 2.
    const plane = makePlane({
      centerMillimeters: [0.05, 0.05, 0.05],
      halfExtentMillimeters: 0.0001,
      sizePixels: 1
    });

    const plan = planSamples(plane, level, 0);

    expect(plan.chunkRequests[0]!.voxelOffsets[0]).toBe(255);
  });

  it("buckets a line geometry's samples", () => {
    const level = makeAnnotationLevel();
    const line = makeLine();

    const plan = planSamples(line, level, 0);

    expect(plan.sampleCount).toBe(line.sampleCount);
    const totalBucketed = plan.chunkRequests.reduce(
      (sum, request) => sum + request.sampleIndices.length,
      0
    );
    expect(totalBucketed).toBe(line.sampleCount);
  });
});

describe("countSampleChunks", () => {
  it("counts distinct chunks without materializing a plan", () => {
    const level = makeAnnotationLevel();
    const plane = makePlane();

    const plan = planSamples(plane, level, 0);
    const count = countSampleChunks(plane, level);

    expect(count).toBe(plan.chunkRequests.length);
  });
});

describe("selectAnnotationLevelIndex", () => {
  function makeVolume(levels: Partial<AnnotationLevel>[]): AnnotationVolume {
    return {
      url: "http://example.com",
      levels: levels.map(makeAnnotationLevel)
    };
  }

  it("picks the finest level when it's within the chunk budget", () => {
    const volume = makeVolume([
      { scaleMillimeters: [0.01, 0.01, 0.01], chunkShapeVoxels: [50, 50, 50] },
      { scaleMillimeters: [0.1, 0.1, 0.1], chunkShapeVoxels: [10, 10, 10] }
    ]);
    const plane = makePlane({ halfExtentMillimeters: 0.05, sizePixels: 8 });

    expect(selectAnnotationLevelIndex(volume, plane)).toBe(0);
  });

  it("escalates to a coarser level when the finest exceeds the chunk budget", () => {
    const volume = makeVolume([
      // Tiny chunks force many distinct chunk requests at the finest level.
      { scaleMillimeters: [0.001, 0.001, 0.001], chunkShapeVoxels: [1, 1, 1] },
      { scaleMillimeters: [0.1, 0.1, 0.1], chunkShapeVoxels: [10, 10, 10] }
    ]);
    const plane = makePlane({ halfExtentMillimeters: 0.4, sizePixels: 8 });

    expect(selectAnnotationLevelIndex(volume, plane)).toBe(1);
  });

  it("returns the coarsest level when every level exceeds the budget", () => {
    const volume = makeVolume([
      { scaleMillimeters: [0.001, 0.001, 0.001], chunkShapeVoxels: [1, 1, 1] },
      { scaleMillimeters: [0.002, 0.002, 0.002], chunkShapeVoxels: [1, 1, 1] }
    ]);
    const plane = makePlane({ halfExtentMillimeters: 0.4, sizePixels: 8 });

    expect(selectAnnotationLevelIndex(volume, plane)).toBe(1);
  });

  it("returns 0 for a volume with no levels", () => {
    const volume: AnnotationVolume = { url: "http://example.com", levels: [] };

    expect(selectAnnotationLevelIndex(volume, makePlane())).toBe(0);
  });
});
