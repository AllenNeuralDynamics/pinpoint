import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { toRaw } from "vue";
import { useCoordinateSystemLibraryStore } from "./coordinate-system-library.store";
import {
  setCoordinateSystemAxisValue,
  solveCoordinateSystemChain
} from "@/features/coordinate-system";
import type { CoordinateSystemSolution } from "@/features/coordinate-system";
import {
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  CANONICAL_AXIS_DIRECTIONS,
  convertCoordinate,
  getAxisDirections,
  getDirectionVector,
  getDownwardProbeRotation,
  getRotationMatrix,
  transformVector
} from "@/utils/coordinate-frame";
import type {
  AxisDirections,
  LocalCoordinateSystem
} from "@/utils/coordinate-frame";
import { makeCoordinateSystem } from "@/test/fixtures";

/** Directions of the default RAS global coordinate system. */
const GLOBAL_DIRECTIONS: AxisDirections = getAxisDirections(
  buildDefaultGlobalCoordinateSystem()
);

/** Default probe rest: depth posterior, electrodes facing superior. */
const LOCAL = buildDefaultLocalCoordinateSystem();

/** A probe resting nose-down, whose depth axis points inferior instead of posterior. */
const DOWNWARD_LOCAL: LocalCoordinateSystem = {
  depthDirection: "Superior_to_inferior",
  forwardDirection: "Posterior_to_anterior"
};

/** Surface coordinates the depth table drives the seeded chain to, in the chain's own mm. */
const SURFACE_POSITIONS: [number, number, number][] = [
  [0, 0, 0],
  [1.5, -2, 0.5],
  [-3, 4, -1],
  [2.25, 0.75, 3]
];

/**
 * Surface node angle triples the depth table drives the seeded chain to, as its
 * Pitch, Yaw, and Roll values in radians: no turn, the quarter turn a resting
 * probe pitches through to point straight down, a yaw, then a mix of all three.
 */
const SURFACE_ANGLES: [number, number, number][] = [
  [0, 0, 0],
  [Math.PI / 2, 0, 0],
  [0, -Math.PI / 3, 0],
  [0.4, 0.7, -0.9]
];

/** Depth the table inserts the probe to, in mm. */
const TABLE_DEPTH_MILLIMETERS = 4;

/**
 * Solve the seeded Surface Coordinate & Depth chain at one surface pose and depth.
 * @param surfacePosition Surface Coordinate node's position values, in mm.
 * @param surfaceAngles Surface Coordinate node's Pitch, Yaw, and Roll values, in radians.
 * @param depthMillimeters Depth node's Depth value, in mm.
 * @param localCoordinateSystem Local coordinate system the probe rests in.
 */
function solveSeededChain(
  surfacePosition: [number, number, number],
  surfaceAngles: [number, number, number],
  depthMillimeters: number,
  localCoordinateSystem: LocalCoordinateSystem
): CoordinateSystemSolution {
  const store = useCoordinateSystemLibraryStore();
  const { chain } = structuredClone(toRaw(store.library[0]!));
  for (const axis of [0, 1, 2]) {
    setCoordinateSystemAxisValue(
      chain[0]!,
      "position",
      axis,
      surfacePosition[axis]!
    );
    setCoordinateSystemAxisValue(
      chain[0]!,
      "rotation",
      axis,
      surfaceAngles[axis]!
    );
  }
  setCoordinateSystemAxisValue(chain[1]!, "position", 2, depthMillimeters);
  return solveCoordinateSystemChain(
    chain,
    null,
    GLOBAL_DIRECTIONS,
    localCoordinateSystem
  );
}

/**
 * Solve the seeded Surface Coordinate & Depth chain at one depth value, with no reference
 * offset so the tip is the depth alone.
 * @param depthMillimeters Depth value to solve at.
 * @param localCoordinateSystem Local coordinate system the probe rests in.
 */
function solveSeededDepth(
  depthMillimeters: number,
  localCoordinateSystem: LocalCoordinateSystem
): [number, number, number] {
  return solveSeededChain(
    [0, 0, 0],
    [0, 0, 0],
    depthMillimeters,
    localCoordinateSystem
  ).tipPosition;
}

/**
 * Direction a solved probe's depth axis points, in global coordinate system mm:
 * the probe's own depth direction turned by its solved rotation.
 * @param solution Solved chain to read the rotation from.
 * @param localCoordinateSystem Local coordinate system the probe rests in.
 */
function getSolvedDepthAxis(
  solution: CoordinateSystemSolution,
  localCoordinateSystem: LocalCoordinateSystem
): [number, number, number] {
  return convertCoordinate(
    CANONICAL_AXIS_DIRECTIONS,
    GLOBAL_DIRECTIONS,
    transformVector(
      getRotationMatrix(GLOBAL_DIRECTIONS, solution.rotation),
      getDirectionVector(localCoordinateSystem.depthDirection)
    )
  );
}

describe("useCoordinateSystemLibraryStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("remove", () => {
    it("drops the matching seeded entry", () => {
      const store = useCoordinateSystemLibraryStore();
      const target = store.library[0]!;

      store.remove(target);

      expect(store.library).toHaveLength(1);
      expect(store.library).not.toContain(target);
    });

    it("matches by id, not object identity", () => {
      const store = useCoordinateSystemLibraryStore();
      const target = store.library[0]!;

      store.remove({ ...target, name: "Renamed" });

      expect(store.library).toHaveLength(1);
      expect(store.library).not.toContain(target);
    });

    it("is a no-op for an unknown id", () => {
      const store = useCoordinateSystemLibraryStore();

      store.remove(makeCoordinateSystem());

      expect(store.library).toHaveLength(2);
    });
  });

  describe("add", () => {
    it("appends after the two seeds", () => {
      const store = useCoordinateSystemLibraryStore();
      const coordinateSystem = makeCoordinateSystem();

      store.add(coordinateSystem);

      expect(store.library).toHaveLength(3);
      expect(store.library[2]!.id).toBe(coordinateSystem.id);
    });

    it("is a no-op when an entry with the same id is already present", () => {
      const store = useCoordinateSystemLibraryStore();
      const existingId = store.library[1]!.id;

      store.add(makeCoordinateSystem({ id: existingId }));

      expect(store.library).toHaveLength(2);
    });
  });

  describe("reorder", () => {
    it("moves a system to a later index", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(0, 1);

      expect(store.library.map(({ name }) => name)).toEqual([
        "NewScale MIS",
        "Surface Coordinate & Depth"
      ]);
    });

    it("moves a system to an earlier index", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(1, 0);

      expect(store.library.map(({ name }) => name)).toEqual([
        "NewScale MIS",
        "Surface Coordinate & Depth"
      ]);
    });

    it("is a no-op for equal indices", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(1, 1);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Surface Coordinate & Depth",
        "NewScale MIS"
      ]);
    });

    it("is a no-op for an out-of-range index", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(1, 5);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Surface Coordinate & Depth",
        "NewScale MIS"
      ]);
    });

    it("moves the entry at index 0, since it is no longer pinned", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(0, 1);

      expect(store.library.map(({ name }) => name)).toEqual([
        "NewScale MIS",
        "Surface Coordinate & Depth"
      ]);
    });
  });

  describe("seeded library", () => {
    it("recreates the two seeds by name, in order", () => {
      const store = useCoordinateSystemLibraryStore();

      expect(store.library.map(({ name }) => name)).toEqual([
        "Surface Coordinate & Depth",
        "NewScale MIS"
      ]);
    });

    it("leaves the X/Y/Z position values on the pre-depth NewScale MIS node free", () => {
      const store = useCoordinateSystemLibraryStore();
      const position = store.library[1]!.chain[2]!.position;

      expect(position.map(({ name }) => name)).toEqual(["X", "Y", "Z"]);
      for (const value of position) {
        expect(value.mode).toBe("free");
      }
    });

    it("defaults every node's display orders to identity", () => {
      const store = useCoordinateSystemLibraryStore();

      for (const coordinateSystem of store.library) {
        for (const node of coordinateSystem.chain) {
          expect(node.positionDisplayOrder).toEqual([0, 1, 2]);
          expect(node.rotationDisplayOrder).toEqual([0, 1, 2]);
        }
      }
    });

    it("marks only the first Surface Coordinate & Depth node onSurface", () => {
      const store = useCoordinateSystemLibraryStore();
      const chain = store.library[0]!.chain;

      expect(chain[0]!.onSurface).toBe(true);
      expect(chain[1]!.onSurface).toBe(false);
    });

    it("marks only the second-to-last NewScale MIS node onSurface", () => {
      const store = useCoordinateSystemLibraryStore();
      const chain = store.library[1]!.chain;

      expect(chain.map(node => node.onSurface)).toEqual([
        false,
        false,
        true,
        false
      ]);
    });

    it("seeds the NewScale MIS chain in Arc -> Module -> Stage -> Depth order", () => {
      const store = useCoordinateSystemLibraryStore();

      expect(store.library[1]!.chain.map(({ name }) => name)).toEqual([
        "Arc",
        "Module",
        "Stage",
        "Depth"
      ]);
    });

    it("offsets every seeded coordinate system by the reference coordinate", () => {
      const store = useCoordinateSystemLibraryStore();

      for (const coordinateSystem of store.library) {
        expect(coordinateSystem.offsetByReferenceCoordinate).toBe(true);
      }
    });

    it("puts each Depth value on its node's local Z axis", () => {
      const store = useCoordinateSystemLibraryStore();

      for (const position of [
        store.library[0]!.chain[1]!.position,
        store.library[1]!.chain[3]!.position
      ]) {
        expect(position.map(({ name }) => name)).toEqual(["", "", "Depth"]);
        expect(position[2]!.mode).toBe("free");
      }
    });

    it("names the Surface Coordinate node's position values after the chain's own axes", () => {
      const store = useCoordinateSystemLibraryStore();

      expect(
        store.library[0]!.chain[0]!.position.map(({ name }) => name)
      ).toEqual(["X", "Y", "Z"]);
    });
  });

  describe("seeded Surface Coordinate & Depth chain", () => {
    it("drives the tip along the local depth direction as its Depth value grows", () => {
      const shallow = solveSeededDepth(3, LOCAL);
      const deep = solveSeededDepth(6, LOCAL);

      // The default rest's depth axis points posterior, which is -y in RAS.
      expect(shallow[0]).toBeCloseTo(0);
      expect(shallow[1]).toBeCloseTo(-3);
      expect(shallow[2]).toBeCloseTo(0);
      expect(deep[1]).toBeCloseTo(-6);
    });

    it("follows a rotated local depth direction instead", () => {
      const shallow = solveSeededDepth(3, DOWNWARD_LOCAL);
      const deep = solveSeededDepth(6, DOWNWARD_LOCAL);

      // A nose-down rest drives depth inferior, which is -z in RAS.
      expect(shallow[0]).toBeCloseTo(0);
      expect(shallow[1]).toBeCloseTo(0);
      expect(shallow[2]).toBeCloseTo(-3);
      expect(deep[2]).toBeCloseTo(-6);
    });

    it("leaves the probe at rest when every value is zero", () => {
      const store = useCoordinateSystemLibraryStore();
      const { chain } = structuredClone(toRaw(store.library[0]!));

      const solution = solveCoordinateSystemChain(
        chain,
        null,
        GLOBAL_DIRECTIONS,
        LOCAL
      );

      expect(solution.tipPosition[0]).toBeCloseTo(0);
      expect(solution.tipPosition[1]).toBeCloseTo(0);
      expect(solution.tipPosition[2]).toBeCloseTo(0);
      expect(solution.rotation[0]).toBeCloseTo(0);
      expect(solution.rotation[1]).toBeCloseTo(0);
      expect(solution.rotation[2]).toBeCloseTo(0);
    });

    for (const [localName, local] of [
      ["the default rest", LOCAL],
      ["a nose-down rest", DOWNWARD_LOCAL]
    ] as [string, LocalCoordinateSystem][]) {
      for (const [angleIndex, angles] of SURFACE_ANGLES.entries()) {
        for (const [positionIndex, surface] of SURFACE_POSITIONS.entries()) {
          it(`inserts its Depth along the probe's own depth axis at ${localName}, angles ${angleIndex}, surface ${positionIndex}`, () => {
            const withoutDepth = solveSeededChain(surface, angles, 0, local);
            const withDepth = solveSeededChain(
              surface,
              angles,
              TABLE_DEPTH_MILLIMETERS,
              local
            );

            // Depth may never turn the probe: it only slides the tip down the shank.
            for (const axis of [0, 1, 2]) {
              expect(withDepth.rotation[axis]).toBeCloseTo(
                withoutDepth.rotation[axis]!
              );
            }
            const depthAxis = getSolvedDepthAxis(withDepth, local);
            for (const axis of [0, 1, 2]) {
              expect(withDepth.tipPosition[axis]).toBeCloseTo(
                withoutDepth.tipPosition[axis]! +
                  TABLE_DEPTH_MILLIMETERS * depthAxis[axis]!
              );
            }
          });
        }
      }
    }

    it("puts a probe into the brain: a quarter turn of Pitch drops the tip straight below the surface point", () => {
      const surface: [number, number, number] = [1.5, -2, 0.5];
      const downward = getDownwardProbeRotation(
        buildDefaultGlobalCoordinateSystem(),
        LOCAL
      );

      const entry = solveSeededChain(surface, [Math.PI / 2, 0, 0], 0, LOCAL);
      const inserted = solveSeededChain(
        surface,
        [Math.PI / 2, 0, 0],
        TABLE_DEPTH_MILLIMETERS,
        LOCAL
      );

      // A quarter turn of Pitch is the pose a new probe starts in, so the chain's
      // own Pitch value has to mean the probe's pitch, and depth then runs
      // straight down: same left-right and posterior-anterior, 4 mm inferior.
      for (const axis of [0, 1, 2]) {
        expect(inserted.rotation[axis]).toBeCloseTo(downward[axis]!);
      }
      expect(inserted.tipPosition[0]).toBeCloseTo(entry.tipPosition[0]!);
      expect(inserted.tipPosition[1]).toBeCloseTo(entry.tipPosition[1]!);
      expect(inserted.tipPosition[2]).toBeCloseTo(
        entry.tipPosition[2]! - TABLE_DEPTH_MILLIMETERS
      );
    });
  });
});
