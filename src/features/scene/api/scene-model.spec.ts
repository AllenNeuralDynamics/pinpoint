import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSceneModel,
  getSceneModel,
  isSceneModel,
  pruneSceneModels,
  putSceneModel
} from "./scene-model.api";

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

describe("buildSceneModel", () => {
  it("builds a scene model with sensible defaults", () => {
    const sceneModel = buildSceneModel("id");

    expect(sceneModel.id).toBe("id");
    expect(sceneModel.position).toEqual([0, 0, 0]);
    expect(sceneModel.rotation).toEqual([0, 0, 0]);
    expect(sceneModel.scale).toEqual([1, 1, 1]);
  });
});

describe("isSceneModel", () => {
  it("accepts a well-formed scene model", () => {
    expect(isSceneModel(buildSceneModel("id"))).toBe(true);
  });

  it("rejects a missing id", () => {
    const { id: _id, ...rest } = buildSceneModel("id");
    expect(isSceneModel(rest)).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(isSceneModel({ ...buildSceneModel("id"), id: "" })).toBe(false);
  });

  it("rejects a non-triple position", () => {
    const sceneModel = { ...buildSceneModel("id"), position: [0, 0] };
    expect(isSceneModel(sceneModel)).toBe(false);
  });

  it("rejects a non-triple scale", () => {
    const sceneModel = { ...buildSceneModel("id"), scale: [1, 1] };
    expect(isSceneModel(sceneModel)).toBe(false);
  });

  it("rejects a NaN in rotation", () => {
    const sceneModel = {
      ...buildSceneModel("id"),
      rotation: [0, Number.NaN, 0]
    };
    expect(isSceneModel(sceneModel)).toBe(false);
  });
});

describe("putSceneModel / getSceneModel", () => {
  it("round-trips a file's name and bytes through the store", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "box.glb", {
      type: "model/gltf-binary"
    });

    await putSceneModel("a", file);
    const read = await getSceneModel("a");

    expect(read).toBeInstanceOf(File);
    expect(read!.name).toBe("box.glb");
    expect(new Uint8Array(await read!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4])
    );
  });

  it("returns null for an unknown id", async () => {
    expect(await getSceneModel("missing")).toBeNull();
  });

  it("returns null for a stored value that isn't a File", async () => {
    memoryStore.set("a", new Blob([new Uint8Array([1])]));

    expect(await getSceneModel("a")).toBeNull();
  });
});

describe("pruneSceneModels", () => {
  it("deletes only the ids not referenced, and returns them", async () => {
    await putSceneModel("a", new File([new Uint8Array([1])], "a.glb"));
    await putSceneModel("b", new File([new Uint8Array([2])], "b.glb"));

    const deleted = await pruneSceneModels(["a"]);

    expect(deleted).toEqual(["b"]);
    expect(await getSceneModel("a")).not.toBeNull();
    expect(await getSceneModel("b")).toBeNull();
  });

  it("deletes nothing and returns an empty list when every id is referenced", async () => {
    await putSceneModel("a", new File([new Uint8Array([1])], "a.glb"));

    const deleted = await pruneSceneModels(["a"]);

    expect(deleted).toEqual([]);
    expect(await getSceneModel("a")).not.toBeNull();
  });
});
