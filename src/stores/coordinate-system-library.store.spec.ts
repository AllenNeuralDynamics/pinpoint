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
  });
});
