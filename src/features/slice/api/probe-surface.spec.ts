import { describe, expect, it, vi } from "vitest";
import type { Array as ZarrArray, DataType, Readable } from "zarrita";
import type { AxisDirections } from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  buildDefaultGlobalCoordinateSystem,
  convertCoordinate,
  getAxisDirections
} from "@/utils/coordinate-frame";
import type { AnnotationLevel } from "../models/annotation-level.model";
import { planSamples } from "./sample-plan.api";
import type { ProbeFrame } from "./probe-frame.api";
import {
  findProbeSurfaceTargets,
  isOnAnnotationSurface,
  type RaySampler
} from "./probe-surface.api";

/** Default RAS global system, whose axes differ from the atlas's own on every line. */
const RAS_AXIS_DIRECTIONS: AxisDirections = getAxisDirections(
  buildDefaultGlobalCoordinateSystem()
);

/**
 * Build a fake single-chunk multiscale level for surface-finding tests.
 * `array` is never read by the planner, so a stub satisfies the type
 * without a real zarr store, mirroring `sample-plan.spec.ts`.
 */
function makeLevel(overrides: Partial<AnnotationLevel> = {}): AnnotationLevel {
  return {
    path: "s0",
    array: {} as unknown as ZarrArray<DataType, Readable>,
    shapeVoxels: [4, 6, 4],
    chunkShapeVoxels: [4, 6, 4],
    scaleMillimeters: [0.1, 0.1, 0.1],
    translationMillimeters: [0, 0, 0],
    ...overrides
  };
}

/** Center of a level's voxel along one axis, in mm - matches `findRayTarget`'s own formula. */
function voxelCenter(
  level: AnnotationLevel,
  axis: number,
  index: number
): number {
  return (
    level.translationMillimeters[axis]! +
    (index + 0.5) * level.scaleMillimeters[axis]!
  );
}

/** Build a dense [ap, si, ml] row-major annotation grid for a level's single chunk. */
function makeGrid(
  level: AnnotationLevel,
  isBrain: (ap: number, si: number, ml: number) => boolean,
  value = 5
): Uint32Array {
  const [shapeA, shapeS, shapeR] = level.shapeVoxels;
  const grid = new Uint32Array(shapeA * shapeS * shapeR);
  for (let ap = 0; ap < shapeA; ap++) {
    for (let si = 0; si < shapeS; si++) {
      for (let ml = 0; ml < shapeR; ml++) {
        if (isBrain(ap, si, ml)) {
          grid[(ap * shapeS + si) * shapeR + ml] = value;
        }
      }
    }
  }
  return grid;
}

/**
 * A `RaySampler` driven by the real `planSamples` over a hand-built grid - the
 * level's single chunk means every `voxelOffsets` entry indexes it directly.
 */
function makeSampleRay(level: AnnotationLevel, grid: Uint32Array): RaySampler {
  return async geometry => {
    const plan = planSamples(geometry, level, 0);
    const values = new Uint32Array(
      geometry.widthPixels * geometry.heightPixels
    );
    for (const request of plan.chunkRequests) {
      for (let index = 0; index < request.sampleIndices.length; index++) {
        values[request.sampleIndices[index]!] =
          grid[request.voxelOffsets[index]!]!;
      }
    }
    return values;
  };
}

function makeFrame(overrides: Partial<ProbeFrame> = {}): ProbeFrame {
  return {
    originMillimeters: [0.15, 0.25, 0.15],
    rightMillimeters: [1, 0, 0],
    upMillimeters: [0, -1, 0],
    ...overrides
  };
}

describe("findProbeSurfaceTargets", () => {
  it("picks the furthest brain voxel from the tip, not the nearest, when already inside the brain", async () => {
    const level = makeLevel();
    const grid = makeGrid(
      level,
      (ap, si, ml) => ap === 1 && ml === 1 && si >= 2 && si <= 4
    );
    const frame = makeFrame({
      originMillimeters: [
        voxelCenter(level, 0, 1),
        voxelCenter(level, 1, 4),
        voxelCenter(level, 2, 1)
      ],
      upMillimeters: [0, -1, 0]
    });

    const result = await findProbeSurfaceTargets(
      frame,
      ATLAS_AXIS_DIRECTIONS,
      level,
      makeSampleRay(level, grid)
    );

    expect(result.axisMillimeters).toBeNull();
    expect(result.inferiorMillimeters).toBeNull();
    expect(result.insideMillimeters).not.toBeNull();
    expect(result.insideMillimeters![0]).toBe(frame.originMillimeters[0]);
    expect(result.insideMillimeters![2]).toBe(frame.originMillimeters[2]);
    // The furthest brain voxel from the tip (index 2) - not the nearest one
    // adjacent to the tip's own voxel (index 3 or 4).
    expect(result.insideMillimeters![1]).toBeCloseTo(
      voxelCenter(level, 1, 2),
      9
    );
  });

  it("returns an axis-only result when outside the brain and only the axis path reaches it", async () => {
    const level = makeLevel();
    const grid = makeGrid(level, () => true);
    const frame = makeFrame({
      originMillimeters: [-0.5, 0.25, 0.15],
      upMillimeters: [-1, 0, 0]
    });

    const result = await findProbeSurfaceTargets(
      frame,
      ATLAS_AXIS_DIRECTIONS,
      level,
      makeSampleRay(level, grid)
    );

    expect(result.insideMillimeters).toBeNull();
    expect(result.inferiorMillimeters).toBeNull();
    expect(result.axisMillimeters).not.toBeNull();
    expect(result.axisMillimeters![1]).toBe(frame.originMillimeters[1]);
    expect(result.axisMillimeters![2]).toBe(frame.originMillimeters[2]);
    expect(result.axisMillimeters![0]).toBeCloseTo(voxelCenter(level, 0, 0), 9);
  });

  it("returns an inferior-only result when outside the brain and only the drop reaches it", async () => {
    const level = makeLevel();
    const grid = makeGrid(level, () => true);
    const frame = makeFrame({
      originMillimeters: [0.15, -0.1, 0.15],
      upMillimeters: [1, 0, 0]
    });

    const result = await findProbeSurfaceTargets(
      frame,
      ATLAS_AXIS_DIRECTIONS,
      level,
      makeSampleRay(level, grid)
    );

    expect(result.insideMillimeters).toBeNull();
    expect(result.axisMillimeters).toBeNull();
    expect(result.inferiorMillimeters).not.toBeNull();
    expect(result.inferiorMillimeters![0]).toBe(frame.originMillimeters[0]);
    expect(result.inferiorMillimeters![2]).toBe(frame.originMillimeters[2]);
    expect(result.inferiorMillimeters![1]).toBeCloseTo(
      voxelCenter(level, 1, 0),
      9
    );
  });

  it("drops along the atlas's inferior axis whatever the global system is", async () => {
    const level = makeLevel();
    const grid = makeGrid(level, () => true);
    const frame = makeFrame({
      originMillimeters: [0.15, -0.1, 0.15],
      upMillimeters: [1, 0, 0]
    });

    const result = await findProbeSurfaceTargets(
      frame,
      RAS_AXIS_DIRECTIONS,
      level,
      makeSampleRay(level, grid)
    );

    // The drop lands on the atlas point [0.15, 0.05, 0.15], which RAS re-expresses
    // on every line: x the animal's right (atlas +ML), y anterior (atlas -AP), z
    // superior (atlas -SI).
    const expected = convertCoordinate(
      ATLAS_AXIS_DIRECTIONS,
      RAS_AXIS_DIRECTIONS,
      [
        frame.originMillimeters[0],
        voxelCenter(level, 1, 0),
        frame.originMillimeters[2]
      ]
    );
    expect(result.inferiorMillimeters).not.toBeNull();
    expect(result.inferiorMillimeters![0]).toBeCloseTo(expected[0], 9);
    expect(result.inferiorMillimeters![1]).toBeCloseTo(expected[1], 9);
    expect(result.inferiorMillimeters![2]).toBeCloseTo(expected[2], 9);
  });

  it("returns both axis and inferior targets, with insideMillimeters null, when both paths reach the brain", async () => {
    const level = makeLevel();
    const grid = makeGrid(level, () => true);
    const frame = makeFrame({
      originMillimeters: [0.15, -0.1, 0.15],
      upMillimeters: [-0.6, -0.8, 0]
    });

    const result = await findProbeSurfaceTargets(
      frame,
      ATLAS_AXIS_DIRECTIONS,
      level,
      makeSampleRay(level, grid)
    );

    expect(result.insideMillimeters).toBeNull();
    expect(result.axisMillimeters).not.toBeNull();
    expect(result.inferiorMillimeters).not.toBeNull();
  });

  it("returns all-null targets when every ray misses the volume bounds", async () => {
    const level = makeLevel();
    const grid = makeGrid(level, () => true);
    const frame = makeFrame({
      originMillimeters: [-100, 0.25, 0.15],
      upMillimeters: [0, -1, 0]
    });

    const result = await findProbeSurfaceTargets(
      frame,
      ATLAS_AXIS_DIRECTIONS,
      level,
      makeSampleRay(level, grid)
    );

    expect(result).toEqual({
      insideMillimeters: null,
      axisMillimeters: null,
      inferiorMillimeters: null
    });
  });

  it("returns all-null targets when the sampler resolves null", async () => {
    const level = makeLevel();
    const frame = makeFrame({
      originMillimeters: [0.15, 0.25, 0.15],
      upMillimeters: [0, -1, 0]
    });
    const sampleRay: RaySampler = async () => null;

    const result = await findProbeSurfaceTargets(
      frame,
      ATLAS_AXIS_DIRECTIONS,
      level,
      sampleRay
    );

    expect(result).toEqual({
      insideMillimeters: null,
      axisMillimeters: null,
      inferiorMillimeters: null
    });
  });

  describe("collapse when the depth axis already runs inferior", () => {
    /**
     * Tip inside the level's bounds, with background above it (so the up
     * ray clips and reaches the sampler but finds no brain) and brain below
     * it, so the collapse branch is actually exercised rather than being
     * pre-empted by `insideMillimeters`.
     * @param upMillimeters Frame's up axis, whose opposite is the depth axis.
     */
    function makeCollapseFixture(upMillimeters: [number, number, number]) {
      const level = makeLevel();
      const grid = makeGrid(
        level,
        (ap, si, ml) => ap === 1 && ml === 1 && si >= 4
      );
      const frame = makeFrame({
        originMillimeters: [
          voxelCenter(level, 0, 1),
          voxelCenter(level, 1, 3),
          voxelCenter(level, 2, 1)
        ],
        upMillimeters
      });
      return { level, frame, sampleRay: vi.fn(makeSampleRay(level, grid)) };
    }

    it("collapses to a single inferior target, sampling exactly twice", async () => {
      const { level, frame, sampleRay } = makeCollapseFixture([0, -1, 0]);

      const result = await findProbeSurfaceTargets(
        frame,
        ATLAS_AXIS_DIRECTIONS,
        level,
        sampleRay
      );

      expect(result.insideMillimeters).toBeNull();
      expect(result.axisMillimeters).toBeNull();
      expect(result.inferiorMillimeters).not.toBeNull();
      expect(result.inferiorMillimeters![0]).toBe(frame.originMillimeters[0]);
      expect(result.inferiorMillimeters![2]).toBe(frame.originMillimeters[2]);
      expect(result.inferiorMillimeters![1]).toBeCloseTo(
        voxelCenter(level, 1, 4),
        9
      );
      expect(sampleRay).toHaveBeenCalledTimes(2);
    });

    it("marches all three rays when the depth axis is a hair off inferior", async () => {
      const tilt = 1e-4;
      const { level, frame, sampleRay } = makeCollapseFixture([
        -Math.sin(tilt),
        -Math.cos(tilt),
        0
      ]);

      const result = await findProbeSurfaceTargets(
        frame,
        ATLAS_AXIS_DIRECTIONS,
        level,
        sampleRay
      );

      expect(sampleRay).toHaveBeenCalledTimes(3);
      expect(result.axisMillimeters).not.toBeNull();
      expect(result.inferiorMillimeters).not.toBeNull();
    });

    it("does not collapse when the depth axis runs superior instead", async () => {
      const level = makeLevel();
      // Brain above the tip only, so the up ray (now inferior) finds nothing
      // and the depth ray (now superior) is the one that reaches it.
      const grid = makeGrid(
        level,
        (ap, si, ml) => ap === 1 && ml === 1 && si <= 2
      );
      const frame = makeFrame({
        originMillimeters: [
          voxelCenter(level, 0, 1),
          voxelCenter(level, 1, 3),
          voxelCenter(level, 2, 1)
        ],
        upMillimeters: [0, 1, 0]
      });
      const sampleRay = vi.fn(makeSampleRay(level, grid));

      const result = await findProbeSurfaceTargets(
        frame,
        ATLAS_AXIS_DIRECTIONS,
        level,
        sampleRay
      );

      expect(sampleRay).toHaveBeenCalledTimes(3);
      expect(result.insideMillimeters).toBeNull();
      expect(result.axisMillimeters).not.toBeNull();
      expect(result.axisMillimeters![1]).toBeCloseTo(
        voxelCenter(level, 1, 2),
        9
      );
      expect(result.inferiorMillimeters).toBeNull();
    });
  });
});

describe("isOnAnnotationSurface", () => {
  it("is true for an annotated voxel with a background face neighbor", async () => {
    const level = makeLevel();
    const grid = makeGrid(
      level,
      (ap, si, ml) => !(ap === 1 && si === 3 && ml === 2)
    );
    const point: [number, number, number] = [
      voxelCenter(level, 0, 2),
      voxelCenter(level, 1, 3),
      voxelCenter(level, 2, 2)
    ];

    const result = await isOnAnnotationSurface(
      level,
      ATLAS_AXIS_DIRECTIONS,
      point,
      makeSampleRay(level, grid)
    );

    expect(result).toBe(true);
  });

  it("converts the point out of the global coordinate system before sampling", async () => {
    const level = makeLevel();
    const grid = makeGrid(
      level,
      (ap, si, ml) => !(ap === 1 && si === 3 && ml === 2)
    );
    const atlasPoint: [number, number, number] = [
      voxelCenter(level, 0, 2),
      voxelCenter(level, 1, 3),
      voxelCenter(level, 2, 2)
    ];

    const result = await isOnAnnotationSurface(
      level,
      RAS_AXIS_DIRECTIONS,
      convertCoordinate(ATLAS_AXIS_DIRECTIONS, RAS_AXIS_DIRECTIONS, atlasPoint),
      makeSampleRay(level, grid)
    );

    expect(result).toBe(true);
  });

  it("is false for an annotated voxel fully enclosed by other annotated voxels", async () => {
    const level = makeLevel();
    const grid = makeGrid(level, () => true);
    const point: [number, number, number] = [
      voxelCenter(level, 0, 2),
      voxelCenter(level, 1, 3),
      voxelCenter(level, 2, 2)
    ];

    const result = await isOnAnnotationSurface(
      level,
      ATLAS_AXIS_DIRECTIONS,
      point,
      makeSampleRay(level, grid)
    );

    expect(result).toBe(false);
  });

  it("is false for a background voxel, regardless of its neighbors", async () => {
    const level = makeLevel();
    const grid = makeGrid(
      level,
      (ap, si, ml) => !(ap === 2 && si === 3 && ml === 2)
    );
    const point: [number, number, number] = [
      voxelCenter(level, 0, 2),
      voxelCenter(level, 1, 3),
      voxelCenter(level, 2, 2)
    ];

    const result = await isOnAnnotationSurface(
      level,
      ATLAS_AXIS_DIRECTIONS,
      point,
      makeSampleRay(level, grid)
    );

    expect(result).toBe(false);
  });

  it("is false for a background voxel diagonal to the center, which touches no face", async () => {
    const level = makeLevel();
    const grid = makeGrid(
      level,
      (ap, si, ml) => !(ap === 3 && si === 3 && ml === 3)
    );
    const point: [number, number, number] = [
      voxelCenter(level, 0, 2),
      voxelCenter(level, 1, 3),
      voxelCenter(level, 2, 2)
    ];

    const result = await isOnAnnotationSurface(
      level,
      ATLAS_AXIS_DIRECTIONS,
      point,
      makeSampleRay(level, grid)
    );

    expect(result).toBe(false);
  });

  it("is true for an annotated voxel with a background +SI face neighbor (index 4)", async () => {
    const level = makeLevel();
    const grid = makeGrid(
      level,
      (ap, si, ml) => !(ap === 2 && si === 4 && ml === 2)
    );
    const point: [number, number, number] = [
      voxelCenter(level, 0, 2),
      voxelCenter(level, 1, 3),
      voxelCenter(level, 2, 2)
    ];

    const result = await isOnAnnotationSurface(
      level,
      ATLAS_AXIS_DIRECTIONS,
      point,
      makeSampleRay(level, grid)
    );

    expect(result).toBe(true);
  });

  it("is false for a point outside the volume, whose samples stay background", async () => {
    const level = makeLevel();
    const grid = makeGrid(level, () => true);

    const result = await isOnAnnotationSurface(
      level,
      ATLAS_AXIS_DIRECTIONS,
      [-10, -10, -10],
      makeSampleRay(level, grid)
    );

    expect(result).toBe(false);
  });

  it("is null when the sampler can't be read", async () => {
    const level = makeLevel();
    const sampleNeighborhood: RaySampler = async () => null;

    const result = await isOnAnnotationSurface(
      level,
      ATLAS_AXIS_DIRECTIONS,
      [
        voxelCenter(level, 0, 2),
        voxelCenter(level, 1, 3),
        voxelCenter(level, 2, 2)
      ],
      sampleNeighborhood
    );

    expect(result).toBeNull();
  });
});
