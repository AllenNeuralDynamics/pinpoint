import { describe, expect, it } from "vitest";
import {
  buildSceneEntityName,
  isSceneEntityName,
  sceneEntityFromColliderName,
  sceneEntityIdFromName,
  sceneEntityNameSuffix
} from "./scene-entity.api";

describe("sceneEntityNameSuffix", () => {
  it("builds a suffix from the kind and suffix", () => {
    expect(sceneEntityNameSuffix("probe", "node")).toBe("_probe_node");
  });
});

describe("buildSceneEntityName", () => {
  it("builds a name from the id, kind, and suffix", () => {
    expect(buildSceneEntityName("u", "object", "node")).toBe("u_object_node");
  });
});

describe("isSceneEntityName", () => {
  it("accepts a name of the given kind", () => {
    expect(isSceneEntityName("u_probe_shank_mesh", "probe")).toBe(true);
  });

  it("rejects a name of a different kind", () => {
    expect(isSceneEntityName("u_object_node", "probe")).toBe(false);
  });
});

describe("sceneEntityIdFromName", () => {
  it("recovers the id from a name of the given kind", () => {
    expect(sceneEntityIdFromName("u_probe_shank_mesh", "probe")).toBe("u");
  });

  it("returns the whole name when the kind's suffix is absent", () => {
    expect(sceneEntityIdFromName("u_object_node", "probe")).toBe(
      "u_object_node"
    );
  });
});

describe("sceneEntityFromColliderName", () => {
  it("resolves an object collider name to its id and kind", () => {
    expect(sceneEntityFromColliderName("u_object_collider")).toEqual({
      id: "u",
      kind: "object"
    });
  });

  it("resolves a probe collider name to its id and kind", () => {
    expect(sceneEntityFromColliderName("u_probe_collider")).toEqual({
      id: "u",
      kind: "probe"
    });
  });

  it("returns null for a non-collider name", () => {
    expect(sceneEntityFromColliderName("u_object_node")).toBeNull();
  });
});
