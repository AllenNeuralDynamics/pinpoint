import { describe, expect, it } from "vitest";
import { ArcRotateCamera, Matrix, Vector3 } from "@babylonjs/core";
import type { Scene } from "@babylonjs/core";
import type { FakeTextRenderer } from "@/test/mount-helper";
import {
  makeFakeTextRenderer,
  makeTestFontAsset,
  makeTestScene
} from "@/test/mount-helper";
import { makeAtlas, makeManifest } from "@/test/fixtures";
import type { AxisGuideAxis, AxisGuides } from "./axis-guide.api";
import {
  buildAxisGuides,
  clearAxisGuides,
  pickAxisGuideDirection
} from "./axis-guide.api";

/**
 * Assert two Babylon vectors are componentwise close, tolerating float
 * error from ASR-axis addition.
 * @param actual Vector produced by the code under test.
 * @param expected Vector to compare against.
 */
function expectVectorCloseTo(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number }
): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.z).toBeCloseTo(expected.z);
}

/** Fake renderers and the `AxisGuides` object they back, for one test. */
interface TestAxisGuides {
  renderers: Record<AxisGuideAxis, FakeTextRenderer>;
  guides: AxisGuides;
}

/**
 * Build a fresh `AxisGuides` object backed by fake renderers and a real
 * fixture font asset, for one test's scene.
 * @param scene Scene the font asset's texture is hosted in.
 */
function makeTestAxisGuides(scene: Scene): TestAxisGuides {
  const renderers = {
    ap: makeFakeTextRenderer(),
    dv: makeFakeTextRenderer(),
    ml: makeFakeTextRenderer()
  };
  const guides: AxisGuides = {
    renderers,
    fontAsset: makeTestFontAsset(scene),
    dispose: () => {}
  };
  return { renderers, guides };
}

describe("buildAxisGuides", () => {
  it("creates axisGuideRoot_node with no parent and an identity world matrix, and parents every renderer to it", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas());

    const root = scene.getTransformNodeByName("axisGuideRoot_node")!;
    expect(root).toBeTruthy();
    expect(root.parent).toBeNull();
    expect(root.getWorldMatrix().isIdentity()).toBe(true);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.parent).toBe(root);
    }
  });

  it("adds each axis's own pair of labels to its own renderer, and one invisible pick mesh per label", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas());

    expect(renderers.ap.paragraphs.map(p => p.text)).toEqual(["+AP", "-AP"]);
    expect(renderers.dv.paragraphs.map(p => p.text)).toEqual(["+DV", "-DV"]);
    expect(renderers.ml.paragraphs.map(p => p.text)).toEqual(["+ML", "-ML"]);
    expect(scene.meshes.map(mesh => mesh.name)).toEqual([
      "axisGuidePick_+AP",
      "axisGuidePick_-AP",
      "axisGuidePick_+DV",
      "axisGuidePick_-DV",
      "axisGuidePick_+ML",
      "axisGuidePick_-ML"
    ]);
    for (const mesh of scene.meshes) {
      expect(mesh.isVisible).toBe(false);
    }
  });

  it("puts each pick mesh exactly on its label's quad", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas());

    const facing = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 0, -1), matrix).normalize();
    const pairs: Array<{
      meshName: string;
      axis: AxisGuideAxis;
      index: 0 | 1;
    }> = [
      { meshName: "axisGuidePick_+AP", axis: "ap", index: 0 },
      { meshName: "axisGuidePick_-AP", axis: "ap", index: 1 },
      { meshName: "axisGuidePick_+DV", axis: "dv", index: 0 },
      { meshName: "axisGuidePick_-DV", axis: "dv", index: 1 },
      { meshName: "axisGuidePick_+ML", axis: "ml", index: 0 },
      { meshName: "axisGuidePick_-ML", axis: "ml", index: 1 }
    ];

    for (const { meshName, axis, index } of pairs) {
      const mesh = scene.getMeshByName(meshName)!;
      const paragraph = renderers[axis].paragraphs[index]!;
      mesh.computeWorldMatrix(true);

      expectVectorCloseTo(
        mesh.absolutePosition,
        paragraph.worldMatrix.getTranslation()
      );
      expectVectorCloseTo(
        facing(mesh.getWorldMatrix()),
        facing(paragraph.worldMatrix)
      );
    }
  });

  it("sizes each pick mesh to its label's quad", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas());

    for (const mesh of scene.meshes) {
      const extendSize = mesh.getBoundingInfo().boundingBox.extendSize;
      expectVectorCloseTo(extendSize, new Vector3(2.85, 1.875, 0));
    }
  });

  it("positions each label one atlas dimension away from the scene origin", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas());

    expectVectorCloseTo(
      renderers.ap.paragraphs[0]!.worldMatrix.getTranslation(),
      new Vector3(0, 0, -13.2)
    );
    expectVectorCloseTo(
      renderers.ap.paragraphs[1]!.worldMatrix.getTranslation(),
      new Vector3(0, 0, 13.2)
    );
    expectVectorCloseTo(
      renderers.dv.paragraphs[0]!.worldMatrix.getTranslation(),
      new Vector3(0, -8, 0)
    );
    expectVectorCloseTo(
      renderers.dv.paragraphs[1]!.worldMatrix.getTranslation(),
      new Vector3(0, 8, 0)
    );
    expectVectorCloseTo(
      renderers.ml.paragraphs[0]!.worldMatrix.getTranslation(),
      new Vector3(11.4, 0, 0)
    );
    expectVectorCloseTo(
      renderers.ml.paragraphs[1]!.worldMatrix.getTranslation(),
      new Vector3(-11.4, 0, 0)
    );
  });

  it("faces each label's readable side outward along its own signed axis", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas());

    const facing = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 0, -1), matrix).normalize();

    expectVectorCloseTo(
      facing(renderers.ap.paragraphs[0]!.worldMatrix),
      new Vector3(0, 1, 0)
    );
    expectVectorCloseTo(
      facing(renderers.ap.paragraphs[1]!.worldMatrix),
      new Vector3(0, 1, 0)
    );
    expectVectorCloseTo(
      facing(renderers.ml.paragraphs[0]!.worldMatrix),
      new Vector3(0, 1, 0)
    );
    expectVectorCloseTo(
      facing(renderers.ml.paragraphs[1]!.worldMatrix),
      new Vector3(0, 1, 0)
    );
    expectVectorCloseTo(
      facing(renderers.dv.paragraphs[0]!.worldMatrix),
      new Vector3(0, 0, -1)
    );
    expectVectorCloseTo(
      facing(renderers.dv.paragraphs[1]!.worldMatrix),
      new Vector3(0, 0, -1)
    );
  });

  it("points each label's top edge towards its own signed axis, except DV where both point -DV", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas());

    const topEdge = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 1, 0), matrix).normalize();

    expectVectorCloseTo(
      topEdge(renderers.ap.paragraphs[0]!.worldMatrix),
      new Vector3(0, 0, -1)
    );
    expectVectorCloseTo(
      topEdge(renderers.ap.paragraphs[1]!.worldMatrix),
      new Vector3(0, 0, 1)
    );
    expectVectorCloseTo(
      topEdge(renderers.ml.paragraphs[0]!.worldMatrix),
      new Vector3(1, 0, 0)
    );
    expectVectorCloseTo(
      topEdge(renderers.ml.paragraphs[1]!.worldMatrix),
      new Vector3(-1, 0, 0)
    );
    expectVectorCloseTo(
      topEdge(renderers.dv.paragraphs[0]!.worldMatrix),
      new Vector3(0, 1, 0)
    );
    expectVectorCloseTo(
      topEdge(renderers.dv.paragraphs[1]!.worldMatrix),
      new Vector3(0, 1, 0)
    );
  });

  it("sizes every label so the widest spans half the atlas's ML length, tracking the atlas", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas());

    const scale = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).length();

    for (const renderer of Object.values(renderers)) {
      for (const paragraph of renderer.paragraphs) {
        expect(scale(paragraph.worldMatrix)).toBeCloseTo(5.7 / 1.52, 4);
      }
    }

    buildAxisGuides(
      scene,
      guides,
      makeAtlas({
        manifest: makeManifest({ resolutions: [[0.05, 0.05, 0.05]] })
      })
    );
    expect(scale(renderers.ml.paragraphs[0]!.worldMatrix)).toBeCloseTo(7.5, 4);
  });

  it("rebuilds idempotently, leaving one root and two paragraphs per renderer", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas());
    buildAxisGuides(scene, guides, makeAtlas());

    expect(
      scene.transformNodes.filter(node => node.name === "axisGuideRoot_node")
    ).toHaveLength(1);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.paragraphs).toHaveLength(2);
    }
  });

  it("builds nothing and clears any existing guides for an atlas with unknown dimensions", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    buildAxisGuides(scene, guides, makeAtlas());
    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeTruthy();

    buildAxisGuides(
      scene,
      guides,
      makeAtlas({ manifest: makeManifest({ resolutions: [] }) })
    );

    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeNull();
    expect(scene.meshes).toHaveLength(0);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.paragraphs).toHaveLength(0);
      expect(renderer.parent).toBeNull();
    }
  });
});

describe("clearAxisGuides", () => {
  it("removes the root node, every label, and every pick mesh, leaving the renderers reusable", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    buildAxisGuides(scene, guides, makeAtlas());
    expect(scene.meshes).toHaveLength(6);

    clearAxisGuides(scene, guides);

    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeNull();
    expect(scene.meshes).toHaveLength(0);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.paragraphs).toHaveLength(0);
      expect(renderer.parent).toBeNull();
    }

    buildAxisGuides(scene, guides, makeAtlas());
    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeTruthy();
    expect(scene.meshes).toHaveLength(6);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.paragraphs).toHaveLength(2);
    }
  });

  it("is a no-op when no guides were built", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);

    expect(() => clearAxisGuides(scene, guides)).not.toThrow();
    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeNull();
  });
});

/**
 * Project a mesh's world-space centre to screen coordinates, without
 * rendering, matching how `scene.pick` interprets screen positions.
 * @param scene Scene the camera and mesh belong to.
 * @param camera Camera to project through.
 * @param meshName Name of the mesh to project.
 */
function projectPickMeshToScreen(
  scene: Scene,
  camera: ArcRotateCamera,
  meshName: string
): Vector3 {
  const mesh = scene.getMeshByName(meshName)!;
  mesh.computeWorldMatrix(true);

  const transform = camera
    .getViewMatrix()
    .multiply(camera.getProjectionMatrix());
  const engine = scene.getEngine();
  const viewport = camera.viewport.toGlobal(
    engine.getRenderWidth(),
    engine.getRenderHeight()
  );

  return Vector3.Project(
    mesh.absolutePosition,
    Matrix.Identity(),
    transform,
    viewport
  );
}

describe("pickAxisGuideDirection", () => {
  it("returns the direction of the axis guide label under a screen position", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);
    buildAxisGuides(scene, guides, makeAtlas());
    const camera = new ArcRotateCamera(
      "c",
      -Math.PI / 2,
      Math.PI / 8,
      50,
      Vector3.Zero(),
      scene
    );
    scene.activeCamera = camera;

    const cases: Array<{ meshName: string; direction: Vector3 }> = [
      { meshName: "axisGuidePick_+AP", direction: new Vector3(0, 0, -1) },
      { meshName: "axisGuidePick_-AP", direction: new Vector3(0, 0, 1) },
      { meshName: "axisGuidePick_+DV", direction: new Vector3(0, -1, 0) },
      { meshName: "axisGuidePick_-DV", direction: new Vector3(0, 1, 0) },
      { meshName: "axisGuidePick_+ML", direction: new Vector3(1, 0, 0) },
      { meshName: "axisGuidePick_-ML", direction: new Vector3(-1, 0, 0) }
    ];

    for (const { meshName, direction } of cases) {
      const screen = projectPickMeshToScreen(scene, camera, meshName);
      const picked = pickAxisGuideDirection(scene, screen.x, screen.y);
      expect(picked).not.toBeNull();
      expectVectorCloseTo(picked!, direction);
    }
  });

  it("returns null when no axis guide label is under the screen position", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);
    buildAxisGuides(scene, guides, makeAtlas());
    const camera = new ArcRotateCamera(
      "c",
      -Math.PI / 2,
      Math.PI / 8,
      50,
      Vector3.Zero(),
      scene
    );
    scene.activeCamera = camera;

    expect(pickAxisGuideDirection(scene, 0, 0)).toBeNull();
  });
});
