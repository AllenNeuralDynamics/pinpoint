import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCoordinateSystemLibraryStore } from "./coordinate-system-library.store";
import { makeCoordinateSystem } from "@/test/fixtures";

describe("useCoordinateSystemLibraryStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("remove", () => {
    it("drops the matching seeded entry", () => {
      const store = useCoordinateSystemLibraryStore();
      const target = store.library[1]!;

      store.remove(target);

      expect(store.library).toHaveLength(2);
      expect(store.library).not.toContain(target);
    });

    it("matches by id, not object identity", () => {
      const store = useCoordinateSystemLibraryStore();
      const target = store.library[1]!;

      store.remove({ ...target, name: "Renamed" });

      expect(store.library).toHaveLength(2);
      expect(store.library).not.toContain(target);
    });

    it("does not remove the pinned default", () => {
      const store = useCoordinateSystemLibraryStore();
      const originalLibrary = [...store.library];

      store.remove(store.library[0]!);

      expect(store.library).toHaveLength(3);
      expect(store.library).toEqual(originalLibrary);
    });

    it("is a no-op for an unknown id", () => {
      const store = useCoordinateSystemLibraryStore();

      store.remove(makeCoordinateSystem());

      expect(store.library).toHaveLength(3);
    });
  });

  describe("add", () => {
    it("appends after the three seeds", () => {
      const store = useCoordinateSystemLibraryStore();
      const coordinateSystem = makeCoordinateSystem();

      store.add(coordinateSystem);

      expect(store.library).toHaveLength(4);
      expect(store.library[3]!.id).toBe(coordinateSystem.id);
    });

    it("is a no-op when an entry with the same id is already present", () => {
      const store = useCoordinateSystemLibraryStore();
      const existingId = store.library[1]!.id;

      store.add(makeCoordinateSystem({ id: existingId }));

      expect(store.library).toHaveLength(3);
    });
  });

  describe("reorder", () => {
    it("moves a system to a later index, leaving the default first", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(1, 2);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Default",
        "NewScale MIS",
        "Surface Coordinate & Depth"
      ]);
    });

    it("moves a system to an earlier index, leaving the default first", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(2, 1);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Default",
        "NewScale MIS",
        "Surface Coordinate & Depth"
      ]);
    });

    it("is a no-op for equal indices", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(1, 1);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Default",
        "Surface Coordinate & Depth",
        "NewScale MIS"
      ]);
    });

    it("is a no-op for an out-of-range index", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(1, 5);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Default",
        "Surface Coordinate & Depth",
        "NewScale MIS"
      ]);
    });

    it("cannot move the default out of index 0", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(0, 2);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Default",
        "Surface Coordinate & Depth",
        "NewScale MIS"
      ]);
    });

    it("cannot displace the default at index 0", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(2, 0);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Default",
        "Surface Coordinate & Depth",
        "NewScale MIS"
      ]);
    });
  });

  describe("seeded library", () => {
    it("recreates the three seeds by name, in order", () => {
      const store = useCoordinateSystemLibraryStore();

      expect(store.library.map(({ name }) => name)).toEqual([
        "Default",
        "Surface Coordinate & Depth",
        "NewScale MIS"
      ]);
    });

    it("carries the fixed Radius value on the NewScale MIS Module Radius node", () => {
      const store = useCoordinateSystemLibraryStore();

      expect(store.library[2]!.chain[2]!.position[2]).toEqual({
        name: "Radius",
        value: 20,
        fixed: true,
        bounds: null
      });
    });

    it("bounds the X/Y/Z position values on the pre-depth NewScale MIS node to -7.5 to 7.5", () => {
      const store = useCoordinateSystemLibraryStore();
      const position = store.library[2]!.chain[3]!.position;

      expect(position.map(({ name }) => name)).toEqual(["X", "Y", "Z"]);
      for (const value of position) {
        expect(value.fixed).toBe(false);
        expect(value.bounds).toEqual([-7.5, 7.5]);
      }
    });

    it("leaves the Surface Coordinate & Depth rotations unbounded", () => {
      const store = useCoordinateSystemLibraryStore();

      for (const value of store.library[1]!.chain[0]!.rotation) {
        expect(value.bounds).toBeNull();
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
      const chain = store.library[1]!.chain;

      expect(chain[0]!.onSurface).toBe(true);
      expect(chain[1]!.onSurface).toBe(false);
    });

    it("marks only the second-to-last NewScale MIS node onSurface", () => {
      const store = useCoordinateSystemLibraryStore();
      const chain = store.library[2]!.chain;

      expect(chain.map(node => node.onSurface)).toEqual([
        false,
        false,
        false,
        true,
        false
      ]);
    });

    it("defaults the Default coordinate system's node to off-surface", () => {
      const store = useCoordinateSystemLibraryStore();

      expect(store.library[0]!.chain[0]!.onSurface).toBe(false);
    });

    it("seeds the NewScale MIS chain in Arc -> Module -> Module Radius -> Stage -> Depth order", () => {
      const store = useCoordinateSystemLibraryStore();

      expect(store.library[2]!.chain.map(({ name }) => name)).toEqual([
        "Arc",
        "Module",
        "Module Radius",
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
        store.library[1]!.chain[1]!.position,
        store.library[2]!.chain[4]!.position
      ]) {
        expect(position.map(({ name }) => name)).toEqual(["", "", "Depth"]);
        expect(position[2]!.fixed).toBe(false);
      }
    });
  });
});
