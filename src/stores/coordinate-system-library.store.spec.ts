import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "vue";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { useCoordinateSystemLibraryStore } from "./coordinate-system-library.store";
import { makeCoordinateSystem } from "@/test/fixtures";

describe("useCoordinateSystemLibraryStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.removeItem("coordinate-system-library");
  });

  it("rejects invalid persisted library data", () => {
    const coordinateSystem = makeCoordinateSystem();
    const legacyCoordinateSystem = { ...coordinateSystem };
    delete (legacyCoordinateSystem as Partial<typeof coordinateSystem>)
      .brainTransform;
    localStorage.setItem(
      "coordinate-system-library",
      JSON.stringify({ library: [legacyCoordinateSystem] })
    );

    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const store = useCoordinateSystemLibraryStore();

    expect(store.library).toHaveLength(3);
    expect(store.library[0]!.brainTransform).toBe(store.sharedBrainTransform);
  });

  it("shares edits across seeds and new chains, detaches by value, and relocks to shared values", () => {
    const store = useCoordinateSystemLibraryStore();
    const [first, second] = store.library;
    store.sharedBrainTransform.rotation[0].value = Math.PI / 12;
    expect(first!.brainTransform).toBe(second!.brainTransform);
    const added = makeCoordinateSystem();
    store.add(added);
    expect(store.library[3]!.brainTransform).toBe(store.sharedBrainTransform);

    store.setBrainTransformShared(first!, false);
    expect(first!.brainTransform.rotation[0].value).toBe(Math.PI / 12);
    expect(first!.brainTransform).not.toBe(store.sharedBrainTransform);
    first!.brainTransform.position[0].value = 3;
    store.sharedBrainTransform.rotation[0].value = Math.PI / 6;
    expect(first!.brainTransform.rotation[0].value).toBe(Math.PI / 12);
    expect(second!.brainTransform.position[0].value).toBe(0);
    expect(second!.brainTransform.rotation[0].value).toBe(Math.PI / 6);

    store.setBrainTransformShared(first!, true);
    expect(first!.brainTransform).toBe(store.sharedBrainTransform);
    expect(first!.brainTransform.position[0].value).toBe(0);
    expect(first!.brainTransform.rotation[0].value).toBe(Math.PI / 6);
  });

  it("restores sharing after persistence while preserving independent roots", () => {
    const original = useCoordinateSystemLibraryStore();
    original.sharedBrainTransform.rotation[0].value = Math.PI / 12;
    original.setBrainTransformShared(original.library[0]!, false);
    original.library[0]!.brainTransform.position[0].value = 3;
    localStorage.setItem(
      "coordinate-system-library",
      JSON.stringify(original.$state)
    );
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const restored = useCoordinateSystemLibraryStore();
    expect(restored.library[1]!.brainTransform).toBe(
      restored.sharedBrainTransform
    );
    expect(restored.library[0]!.brainTransform).not.toBe(
      restored.sharedBrainTransform
    );
    expect(restored.library[0]!.brainTransform.position[0].value).toBe(3);
    restored.sharedBrainTransform.rotation[0].value = 0.5;
    expect(restored.library[1]!.brainTransform.rotation[0].value).toBe(0.5);
    expect(restored.library[0]!.brainTransform.rotation[0].value).toBe(
      Math.PI / 12
    );
  });

  it("uses the surface/depth preset by identity through renaming and reordering", () => {
    const store = useCoordinateSystemLibraryStore();
    const original = store.getSurfaceDepthCoordinateSystem();
    original.name = "My setup";
    store.reorder(0, 2);
    expect(store.getSurfaceDepthCoordinateSystem()).toBe(original);
    store.remove(original);
    const replacement = store.getSurfaceDepthCoordinateSystem();
    expect(replacement.brainTransform).toBe(store.sharedBrainTransform);
    expect(replacement.chain[0]!.onSurface).toBe(true);
    expect(replacement.chain[1]!.position[2].mode).toBe("free");
  });

  it("makes the anatomical preset available on explicit selection after its removal", () => {
    const store = useCoordinateSystemLibraryStore();
    const initial = store.getSurfaceDepthCoordinateSystem(true);
    store.remove(initial);
    const replacement = store.getSurfaceDepthCoordinateSystem(true);
    expect(replacement.chain[0]!.rotationInput).toBe("anatomical");
    expect(replacement.brainTransform).toBe(store.sharedBrainTransform);
    expect(store.getSurfaceDepthCoordinateSystem(true)).toBe(replacement);
  });

  it.each([false, true])(
    "reuses a compatible saved chain with another ID (anatomical: %s)",
    anatomical => {
      const store = useCoordinateSystemLibraryStore();
      const existing = store.getSurfaceDepthCoordinateSystem(anatomical);
      existing.id = crypto.randomUUID();
      existing.name = "My edited setup";
      existing.chain[0]!.position[0].value = 3;
      existing.chain[0]!.rotation[0].value = 0;
      store.setBrainTransformShared(existing, false);
      existing.brainTransform.rotation[0].value = 0.25;
      const before = JSON.stringify(store.$state);

      expect(
        store.missingSurfaceDepthPresets.some(
          preset => preset.anatomical === anatomical
        )
      ).toBe(false);
      expect(store.getSurfaceDepthCoordinateSystem(anatomical)).toBe(existing);
      expect(store.getSurfaceDepthCoordinateSystem(anatomical)).toBe(existing);
      expect(JSON.stringify(store.$state)).toBe(before);
    }
  );

  it("does not recreate a removed generated copy when a compatible saved chain remains", () => {
    const store = useCoordinateSystemLibraryStore();
    const generated = store.getSurfaceDepthCoordinateSystem();
    const saved = store.add({
      ...JSON.parse(JSON.stringify(generated)),
      id: crypto.randomUUID()
    });
    store.remove(generated);
    const count = store.library.length;

    expect(store.getSurfaceDepthCoordinateSystem()).toBe(saved);
    expect(
      store.missingSurfaceDepthPresets.some(preset => !preset.anatomical)
    ).toBe(false);
    expect(store.library).toHaveLength(count);
  });

  it.each(["surface", "depth", "offset"] as const)(
    "creates a preset when an existing chain has incompatible %s constraints",
    incompatible => {
      const store = useCoordinateSystemLibraryStore();
      const existing = store.getSurfaceDepthCoordinateSystem();
      existing.id = crypto.randomUUID();
      if (incompatible === "surface")
        existing.chain[0]!.position[0].mode = "fixed";
      if (incompatible === "depth") existing.chain[1]!.position[0].value = 2;
      if (incompatible === "offset")
        existing.offsetByReferenceCoordinate = false;

      expect(
        store.missingSurfaceDepthPresets.some(preset => !preset.anatomical)
      ).toBe(true);
      const created = store.getSurfaceDepthCoordinateSystem();
      expect(created).not.toBe(existing);
      expect(store.library).toContain(existing);
      expect(store.getSurfaceDepthCoordinateSystem()).toBe(created);
    }
  );

  describe("remove", () => {
    it("drops the matching seeded entry", () => {
      const store = useCoordinateSystemLibraryStore();
      const target = store.library[0]!;

      store.remove(target);

      expect(store.library).toHaveLength(2);
      expect(store.library).not.toContain(target);
    });

    it("matches by id, not object identity", () => {
      const store = useCoordinateSystemLibraryStore();
      const target = store.library[0]!;

      store.remove({ ...target, name: "Renamed" });

      expect(store.library).toHaveLength(2);
      expect(store.library).not.toContain(target);
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
    it("moves a system to a later index", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(0, 1);

      expect(store.library.map(({ name }) => name)).toEqual([
        "NewScale MIS",
        "Surface Coordinate & Depth",
        "Surface Coordinate & Depth (Sagittal/Coronal)"
      ]);
    });

    it("moves a system to an earlier index", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(1, 0);

      expect(store.library.map(({ name }) => name)).toEqual([
        "NewScale MIS",
        "Surface Coordinate & Depth",
        "Surface Coordinate & Depth (Sagittal/Coronal)"
      ]);
    });

    it("is a no-op for equal indices", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(1, 1);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Surface Coordinate & Depth",
        "NewScale MIS",
        "Surface Coordinate & Depth (Sagittal/Coronal)"
      ]);
    });

    it("is a no-op for an out-of-range index", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(1, 5);

      expect(store.library.map(({ name }) => name)).toEqual([
        "Surface Coordinate & Depth",
        "NewScale MIS",
        "Surface Coordinate & Depth (Sagittal/Coronal)"
      ]);
    });

    it("moves the entry at index 0, since it is no longer pinned", () => {
      const store = useCoordinateSystemLibraryStore();

      store.reorder(0, 1);

      expect(store.library.map(({ name }) => name)).toEqual([
        "NewScale MIS",
        "Surface Coordinate & Depth",
        "Surface Coordinate & Depth (Sagittal/Coronal)"
      ]);
    });
  });

  describe("seeded library", () => {
    it("recreates the three seeds by name, in order", () => {
      const store = useCoordinateSystemLibraryStore();

      expect(store.library.map(({ name }) => name)).toEqual([
        "Surface Coordinate & Depth",
        "NewScale MIS",
        "Surface Coordinate & Depth (Sagittal/Coronal)"
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
