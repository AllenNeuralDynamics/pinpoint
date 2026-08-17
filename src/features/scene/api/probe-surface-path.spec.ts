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
import { toSceneVector } from "./coordinate-transforms.api";
import type { AxisDirections } from "@/utils/coordinate-frame";
import { buildAtlasRootNode } from "./structures.api";

/** Global system the choice's coordinates are expressed in, matching a new experiment's. */
const GLOBAL_DIRECTIONS: AxisDirections = [
  "Left_to_right",
  "Posterior_to_anterior",
  "Inferior_to_superior"
];

function makeChoice(
  overrides: Partial<ProbeSurfaceChoice> = {}
): ProbeSurfaceChoice {
  return {
    probeId: "probe-1",
    tipPosition: [5, 3, 5],
    rotation: [0, 0, 0],
    axisTargetMillimeters: [5.1, 3.2, 5],
    inferiorTargetMillimeters: [5, 3.5, 5],
    ...overrides
  };
}

describe("buildProbeSurfacePaths", () => {
  it("creates exactly two tubes, parented to the atlas root, colored by kind", () => {
    const scene = makeTestScene();

    buildProbeSurfacePaths(scene, makeChoice(), GLOBAL_DIRECTIONS);

    const atlasRoot = buildAtlasRootNode(scene);
    const axisMesh = scene.getMeshByName("probeSurfacePath_axis");
    const inferiorMesh = scene.getMeshByName("probeSurfacePath_inferior");

    expect(axisMesh).toBeTruthy();
    expect(inferiorMesh).toBeTruthy();
    expect(axisMesh!.parent).toBe(atlasRoot);
    expect(inferiorMesh!.parent).toBe(atlasRoot);
    expect(
      scene.meshes.filter(mesh => mesh.name.startsWith("probeSurfacePath_"))
    ).toHaveLength(4);

    const axisMaterial = axisMesh!.material as StandardMaterial;
    const inferiorMaterial = inferiorMesh!.material as StandardMaterial;
    expect(axisMaterial.emissiveColor).toEqual(Color3.FromHexString("#2196f3"));
    expect(inferiorMaterial.emissiveColor).toEqual(
      Color3.FromHexString("#4caf50")
    );
  });

  it("replaces rather than duplicates the tubes on a second call", () => {
    const scene = makeTestScene();

    buildProbeSurfacePaths(scene, makeChoice(), GLOBAL_DIRECTIONS);
    buildProbeSurfacePaths(
      scene,
      makeChoice({ tipPosition: [1, 2, 3] }),
      GLOBAL_DIRECTIONS
    );

    expect(
      scene.meshes.filter(mesh => mesh.name.startsWith("probeSurfacePath_"))
    ).toHaveLength(4);
  });

  it("adds a directional arrowhead cone to each tube, parented to and sharing the tube's material", () => {
    const scene = makeTestScene();

    buildProbeSurfacePaths(scene, makeChoice(), GLOBAL_DIRECTIONS);

    const axisTube = scene.getMeshByName("probeSurfacePath_axis")!;
    const axisArrowhead = scene.getMeshByName(
      "probeSurfacePath_axis_arrowhead"
    );
    const inferiorTube = scene.getMeshByName("probeSurfacePath_inferior")!;
    const inferiorArrowhead = scene.getMeshByName(
      "probeSurfacePath_inferior_arrowhead"
    );

    expect(axisArrowhead).toBeTruthy();
    expect(inferiorArrowhead).toBeTruthy();
    expect(axisArrowhead!.parent).toBe(axisTube);
    expect(inferiorArrowhead!.parent).toBe(inferiorTube);
    expect(axisArrowhead!.material).toBe(axisTube.material);
    expect(inferiorArrowhead!.material).toBe(inferiorTube.material);
  });

  it("positions the arrowhead cone past the target, pointing along the tip-to-target direction", () => {
    const scene = makeTestScene();
    const choice = makeChoice();

    buildProbeSurfacePaths(scene, choice, GLOBAL_DIRECTIONS);

    const arrowhead = scene.getMeshByName("probeSurfacePath_axis_arrowhead")!;
    const tip = toSceneVector(GLOBAL_DIRECTIONS, choice.tipPosition);
    const target = toSceneVector(
      GLOBAL_DIRECTIONS,
      choice.axisTargetMillimeters
    );
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
      makeChoice({ axisTargetMillimeters: [5, 3, 5] }),
      GLOBAL_DIRECTIONS
    );

    expect(scene.getMeshByName("probeSurfacePath_axis")).toBeTruthy();
    expect(scene.getMeshByName("probeSurfacePath_axis_arrowhead")).toBeNull();
  });
});

describe("disposeProbeSurfacePaths", () => {
  it("removes both meshes and both materials", () => {
    const scene = makeTestScene();
    buildProbeSurfacePaths(scene, makeChoice(), GLOBAL_DIRECTIONS);

    disposeProbeSurfacePaths(scene);

    expect(scene.getMeshByName("probeSurfacePath_axis")).toBeNull();
    expect(scene.getMeshByName("probeSurfacePath_inferior")).toBeNull();
    expect(scene.getMeshByName("probeSurfacePath_axis_arrowhead")).toBeNull();
    expect(
      scene.getMeshByName("probeSurfacePath_inferior_arrowhead")
    ).toBeNull();
    expect(
      scene.getMaterialByName("probeSurfacePath_axis_material")
    ).toBeNull();
    expect(
      scene.getMaterialByName("probeSurfacePath_inferior_material")
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
    ["probeSurfacePath_inferior", "inferior"],
    ["probeSurfacePath_axis_arrowhead", "axis"],
    ["probeSurfacePath_inferior_arrowhead", "inferior"]
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
