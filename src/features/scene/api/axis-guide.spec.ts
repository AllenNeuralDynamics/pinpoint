import { describe, expect, it } from "vitest";
import {
  ArcRotateCamera,
  Color3,
  Matrix,
  Quaternion,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import type { Scene, StandardMaterial } from "@babylonjs/core";
import type { FakeTextRenderer } from "@/test/mount-helper";
import {
  makeFakeTextRenderer,
  makeTestFontAsset,
  makeTestScene,
  tickScene
} from "@/test/mount-helper";
import { makeAtlas, makeManifest } from "@/test/fixtures";
import { getAtlasDimensionsMillimeters } from "@/features/atlas";
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

/** A mesh's local +Y direction transformed into world space, normalized. */
function worldUp(mesh: {
  computeWorldMatrix(force: boolean): Matrix;
}): Vector3 {
  return Vector3.TransformNormal(
    Vector3.Up(),
    mesh.computeWorldMatrix(true)
  ).normalize();
}

describe("buildAxisGuides", () => {
  it("creates axisGuideRoot_node with no parent and an identity world matrix, and parents every renderer to it", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

    const root = scene.getTransformNodeByName("axisGuideRoot_node")!;
    expect(root).toBeTruthy();
    expect(root.parent).toBeNull();
    expect(root.getWorldMatrix().isIdentity()).toBe(true);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.parent).toBe(root);
    }
  });

  it("adds each axis's own pair of labels to its own renderer, and one arrow and pick mesh per label", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

    expect(renderers.ap.paragraphs.map(p => p.text)).toEqual(["+AP", "-AP"]);
    expect(renderers.dv.paragraphs.map(p => p.text)).toEqual(["+DV", "-DV"]);
    expect(renderers.ml.paragraphs.map(p => p.text)).toEqual(["+ML", "-ML"]);
    expect(scene.meshes.map(mesh => mesh.name)).toEqual([
      "axisGuidePick_+AP",
      "axisGuideArrow_+AP",
      "axisGuideArrow_+AP_head",
      "axisGuidePick_-AP",
      "axisGuideArrow_-AP",
      "axisGuideArrow_-AP_head",
      "axisGuidePick_+DV",
      "axisGuideArrow_+DV",
      "axisGuideArrow_+DV_head",
      "axisGuidePick_-DV",
      "axisGuideArrow_-DV",
      "axisGuideArrow_-DV_head",
      "axisGuidePick_+ML",
      "axisGuideArrow_+ML",
      "axisGuideArrow_+ML_head",
      "axisGuidePick_-ML",
      "axisGuideArrow_-ML",
      "axisGuideArrow_-ML_head"
    ]);
    for (const mesh of scene.meshes.filter(mesh =>
      mesh.name.startsWith("axisGuidePick_")
    )) {
      expect(mesh.isVisible).toBe(false);
    }
  });

  it("puts each pick mesh exactly on its label's quad", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

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

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

    for (const mesh of scene.meshes.filter(mesh =>
      mesh.name.startsWith("axisGuidePick_")
    )) {
      const extendSize = mesh.getBoundingInfo().boundingBox.extendSize;
      expectVectorCloseTo(extendSize, new Vector3(2.85, 1.875, 0));
    }
  });

  it("positions each label past its arrow's tip, one atlas dimension plus the arrow clearance from the scene origin", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

    expectVectorCloseTo(
      renderers.ap.paragraphs[0]!.worldMatrix.getTranslation(),
      new Vector3(0, 0, -15.825)
    );
    expectVectorCloseTo(
      renderers.ap.paragraphs[1]!.worldMatrix.getTranslation(),
      new Vector3(0, 0, 15.825)
    );
    expectVectorCloseTo(
      renderers.dv.paragraphs[0]!.worldMatrix.getTranslation(),
      new Vector3(0, -10.625, 0)
    );
    expectVectorCloseTo(
      renderers.dv.paragraphs[1]!.worldMatrix.getTranslation(),
      new Vector3(0, 10.625, 0)
    );
    expectVectorCloseTo(
      renderers.ml.paragraphs[0]!.worldMatrix.getTranslation(),
      new Vector3(14.025, 0, 0)
    );
    expectVectorCloseTo(
      renderers.ml.paragraphs[1]!.worldMatrix.getTranslation(),
      new Vector3(-14.025, 0, 0)
    );
  });

  it("builds a shaft and cone head arrow per label, tip at the label's anchor and pointing outward", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

    const shaftAp = scene.getMeshByName("axisGuideArrow_+AP")!;
    const headAp = scene.getMeshByName("axisGuideArrow_+AP_head")!;
    expectVectorCloseTo(shaftAp.position, new Vector3(0, 0, -10.66875));
    expectVectorCloseTo(headAp.position, new Vector3(0, 0, -12.54375));
    expect(shaftAp.getBoundingInfo().boundingBox.extendSize.y).toBeCloseTo(
      1.21875
    );
    expect(headAp.getBoundingInfo().boundingBox.extendSize.y).toBeCloseTo(
      0.65625
    );
    expectVectorCloseTo(worldUp(shaftAp), new Vector3(0, 0, -1));
    expectVectorCloseTo(worldUp(headAp), new Vector3(0, 0, -1));
    expect(shaftAp.isPickable).toBe(false);
    expect(headAp.isPickable).toBe(false);

    // +DV's direction (0, -1, 0) is antiparallel to CreateCylinder's local +Y build axis.
    const shaftDv = scene.getMeshByName("axisGuideArrow_+DV")!;
    const headDv = scene.getMeshByName("axisGuideArrow_+DV_head")!;
    expectVectorCloseTo(shaftDv.position, new Vector3(0, -5.46875, 0));
    expectVectorCloseTo(headDv.position, new Vector3(0, -7.34375, 0));
    expectVectorCloseTo(worldUp(shaftDv), new Vector3(0, -1, 0));
    expectVectorCloseTo(worldUp(headDv), new Vector3(0, -1, 0));
    expect(shaftDv.isPickable).toBe(false);
    expect(headDv.isPickable).toBe(false);
  });

  it("colours each axis's arrow material to match its label, unlit", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

    const expectedColors: Record<AxisGuideAxis, Color3> = {
      ap: Color3.Blue(),
      dv: Color3.Green(),
      ml: Color3.Red()
    };
    for (const axis of Object.keys(expectedColors) as AxisGuideAxis[]) {
      const material = scene.getMaterialByName(
        `axisGuideArrow_${axis}_material`
      ) as StandardMaterial;
      expect(material).toBeTruthy();
      expect(material.emissiveColor.equals(expectedColors[axis])).toBe(true);
      expect(material.disableLighting).toBe(true);
    }
  });

  it("faces each label's readable side outward along its own signed axis", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

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

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

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

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

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
      }),
      { kind: "global" }
    );
    expect(scale(renderers.ml.paragraphs[0]!.worldMatrix)).toBeCloseTo(7.5, 4);
  });

  it("rebuilds idempotently, leaving one root and two paragraphs per renderer", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });
    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });

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
    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });
    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeTruthy();

    buildAxisGuides(
      scene,
      guides,
      makeAtlas({ manifest: makeManifest({ resolutions: [] }) }),
      { kind: "global" }
    );

    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeNull();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.paragraphs).toHaveLength(0);
      expect(renderer.parent).toBeNull();
    }
  });

  it("draws Babylon-axis labels in a local frame, keyed to each axis's counterpart renderer", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    const node = new TransformNode("gizmoNode", scene);
    const dimensions = getAtlasDimensionsMillimeters(makeAtlas());
    const longestDimension = Math.max(...dimensions);
    const scale = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).length();

    buildAxisGuides(scene, guides, makeAtlas(), {
      kind: "local",
      getNode: () => node
    });

    expect(renderers.ml.paragraphs.map(p => p.text)).toEqual(["+X", "-X"]);
    expect(renderers.dv.paragraphs.map(p => p.text)).toEqual(["+Y", "-Y"]);
    expect(renderers.ap.paragraphs.map(p => p.text)).toEqual(["+Z", "-Z"]);
    expect(
      scene.meshes
        .filter(mesh => mesh.name.startsWith("axisGuidePick_"))
        .map(mesh => mesh.name)
    ).toEqual([
      "axisGuidePick_+X",
      "axisGuidePick_-X",
      "axisGuidePick_+Y",
      "axisGuidePick_-Y",
      "axisGuidePick_+Z",
      "axisGuidePick_-Z"
    ]);

    const cases: Array<{
      paragraph: (typeof renderers.ml.paragraphs)[number];
      dimension: number;
      direction: Vector3;
    }> = [
      {
        paragraph: renderers.ml.paragraphs[0]!,
        dimension: longestDimension,
        direction: new Vector3(1, 0, 0)
      },
      {
        paragraph: renderers.ml.paragraphs[1]!,
        dimension: longestDimension,
        direction: new Vector3(-1, 0, 0)
      },
      {
        paragraph: renderers.dv.paragraphs[0]!,
        dimension: longestDimension,
        direction: new Vector3(0, 1, 0)
      },
      {
        paragraph: renderers.dv.paragraphs[1]!,
        dimension: longestDimension,
        direction: new Vector3(0, -1, 0)
      },
      {
        paragraph: renderers.ap.paragraphs[0]!,
        dimension: longestDimension,
        direction: new Vector3(0, 0, 1)
      },
      {
        paragraph: renderers.ap.paragraphs[1]!,
        dimension: longestDimension,
        direction: new Vector3(0, 0, -1)
      }
    ];
    for (const { paragraph, dimension, direction } of cases) {
      const labelScale = scale(paragraph.worldMatrix);
      expectVectorCloseTo(
        paragraph.worldMatrix.getTranslation(),
        direction.scale(dimension + 0.7 * labelScale)
      );
    }
  });

  it("orients each local label per the probe-frame convention: ±X/±Y flat facing +Z, ±Z upright facing +Y", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    const node = new TransformNode("gizmoNode", scene);

    buildAxisGuides(scene, guides, makeAtlas(), {
      kind: "local",
      getNode: () => node
    });

    const reading = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).normalize();
    const topEdge = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 1, 0), matrix).normalize();
    const facing = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 0, -1), matrix).normalize();

    const cases: Array<{
      paragraph: (typeof renderers.ml.paragraphs)[number];
      reading: Vector3;
      topEdge: Vector3;
      facing: Vector3;
    }> = [
      {
        paragraph: renderers.ml.paragraphs[0]!,
        reading: new Vector3(0, 1, 0),
        topEdge: new Vector3(1, 0, 0),
        facing: new Vector3(0, 0, 1)
      },
      {
        paragraph: renderers.ml.paragraphs[1]!,
        reading: new Vector3(0, -1, 0),
        topEdge: new Vector3(-1, 0, 0),
        facing: new Vector3(0, 0, 1)
      },
      {
        paragraph: renderers.dv.paragraphs[0]!,
        reading: new Vector3(-1, 0, 0),
        topEdge: new Vector3(0, 1, 0),
        facing: new Vector3(0, 0, 1)
      },
      {
        paragraph: renderers.dv.paragraphs[1]!,
        reading: new Vector3(1, 0, 0),
        topEdge: new Vector3(0, -1, 0),
        facing: new Vector3(0, 0, 1)
      },
      {
        paragraph: renderers.ap.paragraphs[0]!,
        reading: new Vector3(1, 0, 0),
        topEdge: new Vector3(0, 0, 1),
        facing: new Vector3(0, 1, 0)
      },
      {
        paragraph: renderers.ap.paragraphs[1]!,
        reading: new Vector3(1, 0, 0),
        topEdge: new Vector3(0, 0, 1),
        facing: new Vector3(0, 1, 0)
      }
    ];

    for (const testCase of cases) {
      expectVectorCloseTo(
        reading(testCase.paragraph.worldMatrix),
        testCase.reading
      );
      expectVectorCloseTo(
        topEdge(testCase.paragraph.worldMatrix),
        testCase.topEdge
      );
      expectVectorCloseTo(
        facing(testCase.paragraph.worldMatrix),
        testCase.facing
      );
    }
  });

  it("draws the local set at the same em size and arrow geometry as the global set, with every label anchored beyond the atlas's longest dimension", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    const node = new TransformNode("gizmoNode", scene);

    buildAxisGuides(scene, guides, makeAtlas(), {
      kind: "local",
      getNode: () => node
    });

    const scale = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).length();
    for (const renderer of Object.values(renderers)) {
      for (const paragraph of renderer.paragraphs) {
        expect(scale(paragraph.worldMatrix)).toBeCloseTo(5.7 / 1.52, 4);
      }
    }

    // Longest atlas dimension (AP, 13.2mm) plus the shared arrow-clearance-and-label-gap term
    // (2.625mm): every local label anchors the same distance out, regardless of its own axis.
    const translations: Array<{ text: string; position: Vector3 }> = [
      { text: "+X", position: new Vector3(15.825, 0, 0) },
      { text: "-X", position: new Vector3(-15.825, 0, 0) },
      { text: "+Y", position: new Vector3(0, 15.825, 0) },
      { text: "-Y", position: new Vector3(0, -15.825, 0) },
      { text: "+Z", position: new Vector3(0, 0, 15.825) },
      { text: "-Z", position: new Vector3(0, 0, -15.825) }
    ];
    const allParagraphs = Object.values(renderers).flatMap(
      renderer => renderer.paragraphs
    );
    for (const { text, position } of translations) {
      const paragraph = allParagraphs.find(p => p.text === text)!;
      expectVectorCloseTo(paragraph.worldMatrix.getTranslation(), position);
    }

    const shaft = scene.getMeshByName("axisGuideArrow_+X")!;
    const head = scene.getMeshByName("axisGuideArrow_+X_head")!;
    expectVectorCloseTo(shaft.position, new Vector3(10.66875, 0, 0));
    expectVectorCloseTo(head.position, new Vector3(12.54375, 0, 0));
    expect(shaft.getBoundingInfo().boundingBox.extendSize.y).toBeCloseTo(
      1.21875
    );
    expect(head.getBoundingInfo().boundingBox.extendSize.y).toBeCloseTo(
      0.65625
    );

    for (const mesh of scene.meshes.filter(mesh =>
      mesh.name.startsWith("axisGuidePick_")
    )) {
      expect(mesh.getBoundingInfo().boundingBox.extendSize.y).toBeCloseTo(
        1.875
      );
    }
  });

  it("anchors every local label at whichever atlas axis is longest, not its own axis", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    const node = new TransformNode("gizmoNode", scene);
    // DV (500 voxels) is the longest axis here, unlike the default fixture where AP is longest.
    const atlas = makeAtlas({
      manifest: makeManifest({ shape: [[100, 500, 100]] })
    });
    const longestDimension = Math.max(...getAtlasDimensionsMillimeters(atlas));

    buildAxisGuides(scene, guides, atlas, {
      kind: "local",
      getNode: () => node
    });

    const scale = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).length();
    for (const renderer of Object.values(renderers)) {
      for (const paragraph of renderer.paragraphs) {
        const labelScale = scale(paragraph.worldMatrix);
        const distance = paragraph.worldMatrix.getTranslation().length();
        expect(distance).toBeCloseTo(longestDimension + 0.7 * labelScale, 4);
      }
    }
  });
});

/**
 * Build a scene with local-frame guides tracking a node, tick once after
 * giving the node a 90-degree yaw, and set up a camera for pick projection.
 */
function makeRotatedLocalFrameScene(): {
  scene: Scene;
  camera: ArcRotateCamera;
  node: TransformNode;
} {
  const scene = makeTestScene();
  const { guides } = makeTestAxisGuides(scene);
  const node = new TransformNode("gizmoNode", scene);

  buildAxisGuides(scene, guides, makeAtlas(), {
    kind: "local",
    getNode: () => node
  });
  node.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0);
  // The tracker reads `node.absoluteRotationQuaternion` mid-tick: force it fresh first, matching
  // how a full `scene.render()` keeps world matrices current before the next frame's observers run.
  node.computeWorldMatrix(true);
  tickScene(scene, 16);

  const camera = new ArcRotateCamera(
    "c",
    -Math.PI / 3,
    Math.PI / 8,
    50,
    Vector3.Zero(),
    scene
  );
  scene.activeCamera = camera;

  return { scene, camera, node };
}

describe("buildAxisGuides local frame tracking", () => {
  it("keeps the guide root's rotation in sync with the tracked node, live", () => {
    const { scene, node } = makeRotatedLocalFrameScene();
    const root = scene.getTransformNodeByName("axisGuideRoot_node")!;
    const mesh = scene.getMeshByName("axisGuidePick_+X")!;
    // Forcing the mesh's world matrix cascades up to its parent, the root.
    mesh.computeWorldMatrix(true);

    expect(
      root.absoluteRotationQuaternion.equalsWithEpsilon(
        node.absoluteRotationQuaternion
      )
    ).toBe(true);
    expectVectorCloseTo(
      mesh.absolutePosition.normalize(),
      new Vector3(0, 0, -1)
    );
  });

  it("picks the tracked node's rotated world direction, not its frame-local one", () => {
    const { scene, camera } = makeRotatedLocalFrameScene();
    const screen = projectPickMeshToScreen(scene, camera, "axisGuidePick_+X");

    const picked = pickAxisGuideDirection(scene, screen.x, screen.y);

    expect(picked).not.toBeNull();
    expectVectorCloseTo(picked!, new Vector3(0, 0, -1));
  });

  it("re-resolves the tracked node after it is rebuilt, and releases the observer on clear", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);
    let nodeA: TransformNode | null = new TransformNode("a", scene);
    const nodeB = new TransformNode("b", scene);
    nodeB.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI, 0, 0);

    buildAxisGuides(scene, guides, makeAtlas(), {
      kind: "local",
      getNode: () => nodeA ?? nodeB
    });
    const root = scene.getTransformNodeByName("axisGuideRoot_node")!;
    tickScene(scene, 16);
    root.computeWorldMatrix(true);
    expect(
      root.absoluteRotationQuaternion.equalsWithEpsilon(Quaternion.Identity())
    ).toBe(true);

    nodeA!.dispose();
    nodeA = null;
    nodeB.computeWorldMatrix(true);
    tickScene(scene, 16);
    root.computeWorldMatrix(true);

    expect(
      root.absoluteRotationQuaternion.equalsWithEpsilon(
        nodeB.absoluteRotationQuaternion
      )
    ).toBe(true);

    clearAxisGuides(scene, guides);

    expect(scene.onBeforeRenderObservable.hasObservers()).toBe(false);
    expect(() => tickScene(scene, 16)).not.toThrow();
  });

  it("re-points to a newly selected node without disposing the previous one", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);
    const nodeA = new TransformNode("a", scene);
    const nodeB = new TransformNode("b", scene);
    nodeB.rotationQuaternion = Quaternion.RotationYawPitchRoll(
      Math.PI / 2,
      0,
      0
    );
    let current: TransformNode = nodeA;

    buildAxisGuides(scene, guides, makeAtlas(), {
      kind: "local",
      getNode: () => current
    });
    const root = scene.getTransformNodeByName("axisGuideRoot_node")!;
    tickScene(scene, 16);
    root.computeWorldMatrix(true);
    expect(
      root.absoluteRotationQuaternion.equalsWithEpsilon(Quaternion.Identity())
    ).toBe(true);

    current = nodeB;
    nodeB.computeWorldMatrix(true);
    tickScene(scene, 16);
    root.computeWorldMatrix(true);

    expect(
      root.absoluteRotationQuaternion.equalsWithEpsilon(
        nodeB.absoluteRotationQuaternion
      )
    ).toBe(true);
  });
});

describe("clearAxisGuides", () => {
  it("removes the root node, every label, every arrow, and every pick mesh, leaving the renderers reusable", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });
    expect(scene.meshes).toHaveLength(18);

    clearAxisGuides(scene, guides);

    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeNull();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.paragraphs).toHaveLength(0);
      expect(renderer.parent).toBeNull();
    }

    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });
    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeTruthy();
    expect(scene.meshes).toHaveLength(18);
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
    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });
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
    buildAxisGuides(scene, guides, makeAtlas(), { kind: "global" });
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
