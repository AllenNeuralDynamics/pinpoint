import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSceneObjectModel,
  putSceneObjectModel,
  pruneSceneObjectModels
} from "./scene-object-model.api";

// In-memory replacement for the real IndexedDB-backed store, keyed the same
// way `idb-keyval`'s default store is: a single flat map of key -> value.
const memoryStore = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  createStore: () => "fake-store",
  get: async (key: string) => memoryStore.get(key),
  set: async (key: string, value: unknown) => {
    memoryStore.set(key, value);
  },
  del: async (key: string) => {
    memoryStore.delete(key);
  },
  delMany: async (keysToDelete: string[]) => {
    for (const key of keysToDelete) memoryStore.delete(key);
  },
  keys: async () => [...memoryStore.keys()]
}));

beforeEach(() => {
  memoryStore.clear();
});

describe("putSceneObjectModel / getSceneObjectModel", () => {
  it("round-trips a file's name and bytes through the store", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "box.glb", {
      type: "model/gltf-binary"
    });

    await putSceneObjectModel("a", file);
    const read = await getSceneObjectModel("a");

    expect(read).toBeInstanceOf(File);
    expect(read!.name).toBe("box.glb");
    expect(new Uint8Array(await read!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4])
    );
  });

  it("returns null for an unknown id", async () => {
    expect(await getSceneObjectModel("missing")).toBeNull();
  });

  it("returns null for a stored value that isn't a File", async () => {
    memoryStore.set("a", new Blob([new Uint8Array([1])]));

    expect(await getSceneObjectModel("a")).toBeNull();
  });
});

describe("pruneSceneObjectModels", () => {
  it("deletes only the ids not referenced, and returns them", async () => {
    await putSceneObjectModel("a", new File([new Uint8Array([1])], "a.glb"));
    await putSceneObjectModel("b", new File([new Uint8Array([2])], "b.glb"));

    const deleted = await pruneSceneObjectModels(["a"]);

    expect(deleted).toEqual(["b"]);
    expect(await getSceneObjectModel("a")).not.toBeNull();
    expect(await getSceneObjectModel("b")).toBeNull();
  });

  it("deletes nothing and returns an empty list when every id is referenced", async () => {
    await putSceneObjectModel("a", new File([new Uint8Array([1])], "a.glb"));

    const deleted = await pruneSceneObjectModels(["a"]);

    expect(deleted).toEqual([]);
    expect(await getSceneObjectModel("a")).not.toBeNull();
  });
});
