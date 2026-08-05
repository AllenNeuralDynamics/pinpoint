import { describe, expect, it } from "vitest";
import type { StandardMaterial } from "@babylonjs/core";
import { Color3 } from "@babylonjs/core";
import type { ProbeSurfaceChoice } from "@/features/probe";
import { makeTestScene } from "@/test/mount-helper";
import {
  buildProbeSurfacePaths,
  disposeProbeSurfacePaths,
  getProbeSurfacePathKind
} from "./probe-surface-path.api";
import { buildAtlasRootNode } from "./structures.api";

function makeChoice(
  overrides: Partial<ProbeSurfaceChoice> = {}
): ProbeSurfaceChoice {
  return {
    probeId: "probe-1",
    tipPosition: [0, 0, 0],
    rotation: [0, 0, 0],
    tipMillimeters: [5, 3, 5],
    axisTargetMillimeters: [5.1, 3.2, 5],
    dorsoventralTargetMillimeters: [5, 3.5, 5],
    ...overrides
  };
}

describe("buildProbeSurfacePaths", () => {
  it("creates exactly two tubes, parented to the atlas root, colored by kind", () => {
    const scene = makeTestScene();

    buildProbeSurfacePaths(scene, makeChoice());

    const atlasRoot = buildAtlasRootNode(scene);
    const axisMesh = scene.getMeshByName("probeSurfacePath_axis");
    const dorsoventralMesh = scene.getMeshByName(
      "probeSurfacePath_dorsoventral"
    );

    expect(axisMesh).toBeTruthy();
    expect(dorsoventralMesh).toBeTruthy();
    expect(axisMesh!.parent).toBe(atlasRoot);
    expect(dorsoventralMesh!.parent).toBe(atlasRoot);
    expect(
      scene.meshes.filter(mesh => mesh.name.startsWith("probeSurfacePath_"))
    ).toHaveLength(2);

    const axisMaterial = axisMesh!.material as StandardMaterial;
    const dorsoventralMaterial = dorsoventralMesh!.material as StandardMaterial;
    expect(axisMaterial.emissiveColor).toEqual(Color3.FromHexString("#2196f3"));
    expect(dorsoventralMaterial.emissiveColor).toEqual(
      Color3.FromHexString("#4caf50")
    );
  });

  it("replaces rather than duplicates the tubes on a second call", () => {
    const scene = makeTestScene();

    buildProbeSurfacePaths(scene, makeChoice());
    buildProbeSurfacePaths(scene, makeChoice({ tipMillimeters: [1, 2, 3] }));

    expect(
      scene.meshes.filter(mesh => mesh.name.startsWith("probeSurfacePath_"))
    ).toHaveLength(2);
  });
});

describe("disposeProbeSurfacePaths", () => {
  it("removes both meshes and both materials", () => {
    const scene = makeTestScene();
    buildProbeSurfacePaths(scene, makeChoice());

    disposeProbeSurfacePaths(scene);

    expect(scene.getMeshByName("probeSurfacePath_axis")).toBeNull();
    expect(scene.getMeshByName("probeSurfacePath_dorsoventral")).toBeNull();
    expect(
      scene.getMaterialByName("probeSurfacePath_axis_material")
    ).toBeNull();
    expect(
      scene.getMaterialByName("probeSurfacePath_dorsoventral_material")
    ).toBeNull();
  });

  it("does nothing when no tubes exist", () => {
    const scene = makeTestScene();

    expect(() => disposeProbeSurfacePaths(scene)).not.toThrow();
  });
});

describe("getProbeSurfacePathKind", () => {
  it.each([
    ["probeSurfacePath_axis", "axis"],
    ["probeSurfacePath_dorsoventral", "dorsoventral"]
  ] as const)("maps %s to %s", (name, kind) => {
    expect(getProbeSurfacePathKind(name)).toBe(kind);
  });

  it.each([null, undefined, "", "probeSurfacePath_", "other_mesh"])(
    "rejects %s",
    name => {
      expect(getProbeSurfacePathKind(name)).toBeNull();
    }
  );
});
