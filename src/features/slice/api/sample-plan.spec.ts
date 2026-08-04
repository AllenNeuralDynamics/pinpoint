import { describe, expect, it } from "vitest";
import type { Array as ZarrArray, DataType, Readable } from "zarrita";
import type {
  AnnotationLevel,
  AnnotationVolume
} from "../models/annotation-level.model";
import type { SampleGeometry } from "../models/sample-geometry.model";
import { planSamples, selectSamplePlan } from "./sample-plan.api";

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

/** One-band geometry override shape, matching the pre-band single-rectangle fixture. */
interface GeometryOverrides {
  centerMillimeters?: [number, number, number];
  rightMillimeters?: [number, number, number];
  upMillimeters?: [number, number, number];
  halfWidthMillimeters?: number;
  halfHeightMillimeters?: number;
  widthPixels?: number;
  heightPixels?: number;
}

/**
 * Build a single-band test geometry - a plain rectangle, ported to the
 * banded model as one band spanning the full output width.
 * @param overrides Scalars to override; defaults form a 4x4 rectangle
 *   centered at (0.5, 0.5, 0.5).
 */
function makeGeometry(overrides: GeometryOverrides = {}): SampleGeometry {
  const centerMillimeters = overrides.centerMillimeters ?? [0.5, 0.5, 0.5];
  const halfWidthMillimeters = overrides.halfWidthMillimeters ?? 0.1;
  const widthPixels = overrides.widthPixels ?? 4;
  return {
    rightMillimeters: overrides.rightMillimeters ?? [0, 0, 1],
    upMillimeters: overrides.upMillimeters ?? [0, -1, 0],
    halfHeightMillimeters: overrides.halfHeightMillimeters ?? 0.1,
    widthPixels,
    heightPixels: overrides.heightPixels ?? 4,
    bands: [
      {
        centerMillimeters,
        halfWidthMillimeters,
        columnOffset: 0,
        columnCount: widthPixels
      }
    ]
  };
}

describe("planSamples", () => {
  it("buckets every in-bounds sample under its chunk, with no sample lost or duplicated", () => {
    const level = makeAnnotationLevel();
    const geometry = makeGeometry();

    const plan = planSamples(geometry, level, 0);

    const seen = new Set<number>();
    for (const request of plan.chunkRequests) {
      for (const index of request.sampleIndices) {
        expect(seen.has(index)).toBe(false);
        seen.add(index);
      }
    }
    expect(seen.size).toBeLessThanOrEqual(
      geometry.widthPixels * geometry.heightPixels
    );
  });

  it("resolves the exact chunk and voxel offset for a known axis-aligned plane", () => {
    // 1 chunk = 10^3 voxels, scale 0.01mm/voxel -> chunk = 0.1mm cube.
    // Center (0.05, 0.05, 0.05) is voxel (5,5,5), the center of chunk (0,0,0).
    const level = makeAnnotationLevel();
    const geometry = makeGeometry({
      centerMillimeters: [0.05, 0.05, 0.05],
      rightMillimeters: [0, 0, 1],
      upMillimeters: [0, -1, 0],
      halfWidthMillimeters: 0.005,
      halfHeightMillimeters: 0.005,
      widthPixels: 1,
      heightPixels: 1
    });

    const plan = planSamples(geometry, level, 0);

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
    const geometry = makeGeometry({
      centerMillimeters: [0.5, 0.5, 0.5],
      rightMillimeters: [0, 0, 1],
      upMillimeters: [0, -1, 0],
      halfWidthMillimeters: 0.45,
      halfHeightMillimeters: 0.45,
      widthPixels: 2,
      heightPixels: 2
    });

    const plan = planSamples(geometry, level, 0);

    const chunkOfRow = (row: number) => {
      const index = row * geometry.widthPixels;
      const request = plan.chunkRequests.find(r =>
        r.sampleIndices.includes(index)
      );
      return request?.chunkCoordinates[1];
    };

    expect(chunkOfRow(0)).toBeLessThan(chunkOfRow(1)!);
  });

  it("walks a non-square rectangle row-major from the +up, -right corner", () => {
    const level = makeAnnotationLevel();
    // 4 columns x 2 rows of exactly one voxel each, centered on voxel (5,5,5).
    const geometry = makeGeometry({
      centerMillimeters: [0.05, 0.05, 0.05],
      rightMillimeters: [0, 0, 1],
      upMillimeters: [0, -1, 0],
      halfWidthMillimeters: 0.02,
      halfHeightMillimeters: 0.01,
      widthPixels: 4,
      heightPixels: 2
    });

    const plan = planSamples(geometry, level, 0);

    expect(plan.chunkRequests).toHaveLength(1);
    expect(Array.from(plan.chunkRequests[0]!.sampleIndices)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7
    ]);
    // offset = (voxelA * 10 + voxelS) * 10 + voxelR, voxelA = 5;
    // row 0 -> voxelS 4 (more superior), row 1 -> voxelS 5; columns -> voxelR 3..6.
    expect(Array.from(plan.chunkRequests[0]!.voxelOffsets)).toEqual([
      543, 544, 545, 546, 553, 554, 555, 556
    ]);
  });

  it("drops samples that fall outside the volume", () => {
    const level = makeAnnotationLevel({ shapeVoxels: [10, 10, 10] });
    const geometry = makeGeometry({
      centerMillimeters: [0, 0, 0],
      halfWidthMillimeters: 1,
      halfHeightMillimeters: 1,
      widthPixels: 4,
      heightPixels: 4
    });

    const plan = planSamples(geometry, level, 0);

    const totalBucketed = plan.chunkRequests.reduce(
      (sum, request) => sum + request.sampleIndices.length,
      0
    );
    expect(totalBucketed).toBeLessThan(
      geometry.widthPixels * geometry.heightPixels
    );
  });

  it("indexes each axis by its own anisotropic scale", () => {
    const level = makeAnnotationLevel({
      shapeVoxels: [100, 100, 100],
      chunkShapeVoxels: [100, 100, 100],
      scaleMillimeters: [0.02, 0.01, 0.005]
    });
    // A point 1 voxel off-center on each axis, in mm, using that axis's scale.
    const geometry = makeGeometry({
      centerMillimeters: [0.02, 0.01, 0.005],
      halfWidthMillimeters: 0.0001,
      halfHeightMillimeters: 0.0001,
      widthPixels: 1,
      heightPixels: 1
    });

    const plan = planSamples(geometry, level, 0);

    // Voxel (1, 1, 1) in a single 100^3 chunk -> offset (1*100+1)*100+1 = 10101.
    expect(plan.chunkRequests[0]!.voxelOffsets[0]).toBe(10101);
  });

  it("shifts the sampled voxel by a non-zero translation", () => {
    const level = makeAnnotationLevel({
      translationMillimeters: [0.03, 0, 0]
    });
    // Without the translation this would resolve to voxel 5; with it, voxel 2.
    const geometry = makeGeometry({
      centerMillimeters: [0.05, 0.05, 0.05],
      halfWidthMillimeters: 0.0001,
      halfHeightMillimeters: 0.0001,
      widthPixels: 1,
      heightPixels: 1
    });

    const plan = planSamples(geometry, level, 0);

    expect(plan.chunkRequests[0]!.voxelOffsets[0]).toBe(255);
  });

  it("folds two bands reading the same chunk into one chunk request", () => {
    // Both bands sit entirely inside chunk (0,0,0)'s 0.1mm cube [0, 0.1)^3.
    const level = makeAnnotationLevel();
    const bandA = {
      centerMillimeters: [0.05, 0.05, 0.03] as [number, number, number],
      halfWidthMillimeters: 0.01,
      columnOffset: 0,
      columnCount: 2
    };
    const bandB = {
      centerMillimeters: [0.05, 0.05, 0.07] as [number, number, number],
      halfWidthMillimeters: 0.01,
      columnOffset: 2,
      columnCount: 2
    };
    const geometry: SampleGeometry = {
      rightMillimeters: [0, 0, 1],
      upMillimeters: [0, -1, 0],
      halfHeightMillimeters: 0.01,
      widthPixels: 4,
      heightPixels: 2,
      bands: [bandA, bandB]
    };

    const plan = planSamples(geometry, level, 0);

    expect(plan.chunkRequests).toHaveLength(1);
    expect(
      Array.from(plan.chunkRequests[0]!.sampleIndices).sort((a, b) => a - b)
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    // Two separate one-band plans over the same two rectangles return one
    // request each - the win above is folding both into a single request.
    const planA = planSamples(
      {
        ...geometry,
        widthPixels: 2,
        bands: [{ ...bandA, columnOffset: 0 }]
      },
      level,
      0
    );
    const planB = planSamples(
      {
        ...geometry,
        widthPixels: 2,
        bands: [{ ...bandB, columnOffset: 0 }]
      },
      level,
      0
    );
    expect(planA.chunkRequests).toHaveLength(1);
    expect(planB.chunkRequests).toHaveLength(1);
  });

  it("places unequal-width bands' samples at row * widthPixels + columnOffset + column", () => {
    const level = makeAnnotationLevel();
    const geometry: SampleGeometry = {
      rightMillimeters: [0, 0, 1],
      upMillimeters: [0, -1, 0],
      halfHeightMillimeters: 0.01,
      widthPixels: 4,
      heightPixels: 2,
      bands: [
        {
          centerMillimeters: [0.05, 0.05, 0.03],
          halfWidthMillimeters: 0.005,
          columnOffset: 0,
          columnCount: 1
        },
        {
          centerMillimeters: [0.05, 0.05, 0.07],
          halfWidthMillimeters: 0.015,
          columnOffset: 1,
          columnCount: 3
        }
      ]
    };

    const plan = planSamples(geometry, level, 0);

    const seen = new Set<number>();
    for (const request of plan.chunkRequests) {
      for (const index of request.sampleIndices) {
        expect(seen.has(index)).toBe(false);
        seen.add(index);
      }
    }
    expect(Array.from(seen).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7
    ]);
  });

  it("selects a level as fine as the geometry's finest band, not their average", () => {
    const volume: AnnotationVolume = {
      levels: [
        makeAnnotationLevel({
          scaleMillimeters: [0.001, 0.001, 0.001],
          chunkShapeVoxels: [50, 50, 50]
        }),
        makeAnnotationLevel({
          scaleMillimeters: [0.01, 0.01, 0.01],
          chunkShapeVoxels: [50, 50, 50]
        })
      ]
    };

    const coarseGeometry = makeGeometry({
      halfWidthMillimeters: 0.05,
      halfHeightMillimeters: 0.05,
      widthPixels: 4,
      heightPixels: 4
    });
    const fineGeometry = makeGeometry({
      halfWidthMillimeters: 0.0005,
      halfHeightMillimeters: 0.05,
      widthPixels: 4,
      heightPixels: 4
    });
    const twoBandGeometry: SampleGeometry = {
      rightMillimeters: coarseGeometry.rightMillimeters,
      upMillimeters: coarseGeometry.upMillimeters,
      halfHeightMillimeters: coarseGeometry.halfHeightMillimeters,
      widthPixels: 4,
      heightPixels: 4,
      bands: [
        { ...coarseGeometry.bands[0]!, columnOffset: 0, columnCount: 2 },
        { ...fineGeometry.bands[0]!, columnOffset: 2, columnCount: 2 }
      ]
    };

    const coarseIndex = selectSamplePlan(coarseGeometry, volume).levelIndex;
    const fineIndex = selectSamplePlan(fineGeometry, volume).levelIndex;
    const twoBandIndex = selectSamplePlan(twoBandGeometry, volume).levelIndex;

    expect(twoBandIndex).toBe(fineIndex);
    expect(twoBandIndex).toBeLessThanOrEqual(coarseIndex);
    expect(twoBandIndex).not.toBe(coarseIndex);
  });
});

describe("selectSamplePlan", () => {
  function makeVolume(levels: Partial<AnnotationLevel>[]): AnnotationVolume {
    return {
      levels: levels.map(makeAnnotationLevel)
    };
  }

  it("picks the finest level when it's within the chunk budget", () => {
    const volume = makeVolume([
      { scaleMillimeters: [0.01, 0.01, 0.01], chunkShapeVoxels: [50, 50, 50] },
      { scaleMillimeters: [0.1, 0.1, 0.1], chunkShapeVoxels: [10, 10, 10] }
    ]);
    const geometry = makeGeometry({
      halfWidthMillimeters: 0.05,
      halfHeightMillimeters: 0.05,
      widthPixels: 8,
      heightPixels: 8
    });

    expect(selectSamplePlan(geometry, volume).levelIndex).toBe(0);
  });

  it("escalates to a coarser level when the finest exceeds the chunk budget", () => {
    const volume = makeVolume([
      // Tiny chunks force many distinct chunk requests at the finest level.
      { scaleMillimeters: [0.001, 0.001, 0.001], chunkShapeVoxels: [1, 1, 1] },
      { scaleMillimeters: [0.1, 0.1, 0.1], chunkShapeVoxels: [10, 10, 10] }
    ]);
    const geometry = makeGeometry({
      halfWidthMillimeters: 0.4,
      halfHeightMillimeters: 0.4,
      widthPixels: 8,
      heightPixels: 8
    });

    expect(selectSamplePlan(geometry, volume).levelIndex).toBe(1);
  });

  it("returns the coarsest level when every level exceeds the budget", () => {
    const volume = makeVolume([
      { scaleMillimeters: [0.001, 0.001, 0.001], chunkShapeVoxels: [1, 1, 1] },
      { scaleMillimeters: [0.002, 0.002, 0.002], chunkShapeVoxels: [1, 1, 1] }
    ]);
    const geometry = makeGeometry({
      halfWidthMillimeters: 0.4,
      halfHeightMillimeters: 0.4,
      widthPixels: 8,
      heightPixels: 8
    });

    expect(selectSamplePlan(geometry, volume).levelIndex).toBe(1);
  });

  it("returns 0 for a volume with no levels", () => {
    const volume: AnnotationVolume = { levels: [] };

    expect(selectSamplePlan(makeGeometry(), volume).levelIndex).toBe(0);
  });
});
