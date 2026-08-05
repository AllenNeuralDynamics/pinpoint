import { describe, expect, it } from "vitest";
import type { StandardMaterial } from "@babylonjs/core";
import { Color3, Vector3 } from "@babylonjs/core";
import type { ProbeSurfaceChoice } from "@/features/probe";
import { makeTestScene } from "@/test/mount-helper";
import {
  buildProbeSurfacePaths,
  disposeProbeSurfacePaths,
  getProbeSurfacePathKind
} from "./probe-surface-path.api";
import { asrToVector3 } from "./coordinate-transforms.api";
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
    ).toHaveLength(4);

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
    ).toHaveLength(4);
  });

  it("adds a directional arrowhead cone to each tube, parented to and sharing the tube's material", () => {
    const scene = makeTestScene();

    buildProbeSurfacePaths(scene, makeChoice());

    const axisTube = scene.getMeshByName("probeSurfacePath_axis")!;
    const axisArrowhead = scene.getMeshByName(
      "probeSurfacePath_axis_arrowhead"
    );
    const dorsoventralTube = scene.getMeshByName(
      "probeSurfacePath_dorsoventral"
    )!;
    const dorsoventralArrowhead = scene.getMeshByName(
      "probeSurfacePath_dorsoventral_arrowhead"
    );

    expect(axisArrowhead).toBeTruthy();
    expect(dorsoventralArrowhead).toBeTruthy();
    expect(axisArrowhead!.parent).toBe(axisTube);
    expect(dorsoventralArrowhead!.parent).toBe(dorsoventralTube);
    expect(axisArrowhead!.material).toBe(axisTube.material);
    expect(dorsoventralArrowhead!.material).toBe(dorsoventralTube.material);
  });

  it("positions the arrowhead cone past the target, pointing along the tip-to-target direction", () => {
    const scene = makeTestScene();
    const choice = makeChoice();

    buildProbeSurfacePaths(scene, choice);

    const arrowhead = scene.getMeshByName("probeSurfacePath_axis_arrowhead")!;
    const tip = asrToVector3(choice.tipMillimeters);
    const target = asrToVector3(choice.axisTargetMillimeters);
    const direction = target.subtract(tip).normalize();
    const expectedPosition = target.add(direction.scale(0.375));

    expect(arrowhead.position.x).toBeCloseTo(expectedPosition.x);
    expect(arrowhead.position.y).toBeCloseTo(expectedPosition.y);
    expect(arrowhead.position.z).toBeCloseTo(expectedPosition.z);

    const rotatedUp = Vector3.Up().applyRotationQuaternion(
      arrowhead.rotationQuaternion!
    );
    expect(rotatedUp.x).toBeCloseTo(direction.x);
    expect(rotatedUp.y).toBeCloseTo(direction.y);
    expect(rotatedUp.z).toBeCloseTo(direction.z);
  });

  it("skips the arrowhead cone when the tube's tip and target coincide", () => {
    const scene = makeTestScene();

    buildProbeSurfacePaths(
      scene,
      makeChoice({ axisTargetMillimeters: [5, 3, 5] })
    );

    expect(scene.getMeshByName("probeSurfacePath_axis")).toBeTruthy();
    expect(scene.getMeshByName("probeSurfacePath_axis_arrowhead")).toBeNull();
  });
});

describe("disposeProbeSurfacePaths", () => {
  it("removes both meshes and both materials", () => {
    const scene = makeTestScene();
    buildProbeSurfacePaths(scene, makeChoice());

    disposeProbeSurfacePaths(scene);

    expect(scene.getMeshByName("probeSurfacePath_axis")).toBeNull();
    expect(scene.getMeshByName("probeSurfacePath_dorsoventral")).toBeNull();
    expect(scene.getMeshByName("probeSurfacePath_axis_arrowhead")).toBeNull();
    expect(
      scene.getMeshByName("probeSurfacePath_dorsoventral_arrowhead")
    ).toBeNull();
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
    ["probeSurfacePath_dorsoventral", "dorsoventral"],
    ["probeSurfacePath_axis_arrowhead", "axis"],
    ["probeSurfacePath_dorsoventral_arrowhead", "dorsoventral"]
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
