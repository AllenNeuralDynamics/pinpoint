import { describe, expect, it } from "vitest";
import {
  ArcRotateCamera,
  Matrix,
  Quaternion,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import type { Scene, StandardMaterial } from "@babylonjs/core";
import type {
  FakeAxisGuideRenderers,
  FakeTextRenderer
} from "@/test/mount-helper";
import {
  makeFakeAxisGuideRenderers,
  makeTestFontAsset,
  makeTestScene,
  tickScene
} from "@/test/mount-helper";
import { makeAtlas, makeManifest } from "@/test/fixtures";
import { getAtlasDimensionsMillimeters } from "@/features/atlas";
import type {
  AnatomicalDirection,
  AnatomicalLine,
  AxisDirections
} from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  CANONICAL_AXIS_DIRECTIONS,
  getAxisDirections,
  getDirectionVector
} from "@/utils/coordinate-frame";
import { toWorldDirection } from "./coordinate-transforms.api";
import type { FrameAxes } from "../models/frame-axis.model";
import {
  getLocalFrameAxes,
  GLOBAL_FRAME_AXIS_COLORS,
  LOCAL_FRAME_AXIS_COLORS
} from "./frame-axes.api";
import type { AxisGuideLabels, AxisGuides } from "./axis-guide.api";
import {
  buildAxisGuides,
  clearAxisGuides,
  pickAxisGuideDirection
} from "./axis-guide.api";

/** Axis directions new experiments start in: x right, y anterior, z superior. */
const RAS_DIRECTIONS: AxisDirections = getAxisDirections(
  buildDefaultGlobalCoordinateSystem()
);

/**
 * A permutation of the same three anatomical lines with two axes reversed: an
 * atlas's own directions, x posterior, y inferior, z right.
 */
const PIR_DIRECTIONS: AxisDirections = ATLAS_AXIS_DIRECTIONS;

/**
 * `RAS` with only its left-right axis reversed, so the `ML` labels swap ends
 * while the other four stay put.
 */
const LAS_DIRECTIONS: AxisDirections = [
  "Right_to_left",
  "Posterior_to_anterior",
  "Inferior_to_superior"
];

/**
 * Local axes of a probe resting depth posterior with its electrodes facing
 * superior -- the default local coordinate system. Every one of them runs along
 * a *negative* Babylon axis of the probe's body, which is what makes drawing
 * the body's own axes wrong.
 */
const PROBE_LOCAL_AXES: FrameAxes = getLocalFrameAxes(
  buildDefaultLocalCoordinateSystem(),
  ["Depth", "Forward", "Right"]
).axes;

/** Labels for `RAS_DIRECTIONS`, matching the built-in names its axes fall back to. */
const RAS_LABELS: AxisGuideLabels = {
  global: ["ML", "AP", "SI"],
  local: PROBE_LOCAL_AXES
};

/** Labels for `PIR_DIRECTIONS`, whose axes run along the same lines in another order. */
const PIR_LABELS: AxisGuideLabels = {
  global: ["AP", "SI", "ML"],
  local: PROBE_LOCAL_AXES
};

/**
 * Assert two Babylon vectors are componentwise close, tolerating float
 * error from axis permutation.
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
  renderers: FakeAxisGuideRenderers;
  guides: AxisGuides;
}

/**
 * Build a fresh `AxisGuides` object backed by fake renderers and a real
 * fixture font asset, for one test's scene.
 * @param scene Scene the font asset's texture is hosted in.
 */
function makeTestAxisGuides(scene: Scene): TestAxisGuides {
  const renderers = makeFakeAxisGuideRenderers();
  const guides: AxisGuides = {
    renderers,
    fontAsset: makeTestFontAsset(scene),
    dispose: () => {}
  };
  return { renderers, guides };
}

/**
 * The three renderers a global guide set draws on, in the order its lines are
 * coloured.
 * @param renderers Fake renderers the guides were drawn on.
 */
function globalRenderers(
  renderers: FakeAxisGuideRenderers
): FakeTextRenderer[] {
  return [
    renderers.leftRight,
    renderers.inferiorSuperior,
    renderers.posteriorAnterior
  ];
}

/**
 * The three renderers a local guide set draws on, in its frame's axis order.
 * @param renderers Fake renderers the guides were drawn on.
 */
function localRenderers(renderers: FakeAxisGuideRenderers): FakeTextRenderer[] {
  return [renderers.localAxis0, renderers.localAxis1, renderers.localAxis2];
}

/**
 * Rounded, comparable key of a world direction, so a guide's placement can be
 * matched against another guide's or against an anatomical direction's without
 * comparing floats componentwise.
 * @param vector World-space vector to key, of any length.
 */
function worldAxisKey(vector: Vector3): string {
  return vector
    .normalizeToNew()
    .asArray()
    .map(value => Math.round(value))
    .join(",");
}

/**
 * Babylon world direction an anatomical direction points, taken from the same
 * conversion the guides go through so no expectation carries a world literal.
 * @param direction Anatomical direction to convert.
 */
function worldDirectionOf(direction: AnatomicalDirection): Vector3 {
  return toWorldDirection(
    CANONICAL_AXIS_DIRECTIONS,
    getDirectionVector(direction)
  );
}

/**
 * Every drawn label with the direction it was placed along, gathered across
 * the given renderers, so a test can compare label-to-direction mappings.
 * @param renderers Fake renderers the labels were drawn on.
 */
function collectGuideDirections(
  renderers: FakeTextRenderer[]
): Array<{ text: string; direction: string }> {
  return renderers
    .flatMap(renderer => renderer.paragraphs)
    .map(paragraph => ({
      text: paragraph.text,
      direction: worldAxisKey(paragraph.worldMatrix.getTranslation())
    }))
    .sort((a, b) => a.text.localeCompare(b.text));
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
  it("creates axisGuideRoot_node with no parent and an identity world matrix, and parents each of its renderers to it", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    const root = scene.getTransformNodeByName("axisGuideRoot_node")!;
    expect(root).toBeTruthy();
    expect(root.parent).toBeNull();
    expect(root.getWorldMatrix().isIdentity()).toBe(true);
    for (const renderer of globalRenderers(renderers)) {
      expect(renderer.parent).toBe(root);
    }
  });

  it("draws each axis's pair of labels on the renderer of the anatomical line it runs along, and one arrow and pick mesh per label", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    expect(renderers.leftRight.paragraphs.map(p => p.text)).toEqual([
      "+ML",
      "-ML"
    ]);
    expect(renderers.posteriorAnterior.paragraphs.map(p => p.text)).toEqual([
      "+AP",
      "-AP"
    ]);
    expect(renderers.inferiorSuperior.paragraphs.map(p => p.text)).toEqual([
      "+SI",
      "-SI"
    ]);
    expect(scene.meshes.map(mesh => mesh.name)).toEqual([
      "axisGuidePick_0+",
      "axisGuideArrow_0+",
      "axisGuideArrow_0+_head",
      "axisGuidePick_0-",
      "axisGuideArrow_0-",
      "axisGuideArrow_0-_head",
      "axisGuidePick_1+",
      "axisGuideArrow_1+",
      "axisGuideArrow_1+_head",
      "axisGuidePick_1-",
      "axisGuideArrow_1-",
      "axisGuideArrow_1-_head",
      "axisGuidePick_2+",
      "axisGuideArrow_2+",
      "axisGuideArrow_2+_head",
      "axisGuidePick_2-",
      "axisGuideArrow_2-",
      "axisGuideArrow_2-_head"
    ]);
    for (const mesh of scene.meshes.filter(mesh =>
      mesh.name.startsWith("axisGuidePick_")
    )) {
      expect(mesh.isVisible).toBe(false);
    }
  });

  it("marks each global guide with the world direction its anatomical direction points", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    const ras = collectGuideDirections(globalRenderers(renderers));
    const directionOf = (text: string) =>
      ras.find(guide => guide.text === text)!.direction;

    // `RAS` names its axes rightward, anterior, and superior positive, so each
    // `+` label has to sit on that anatomical end -- `+ML` on the animal's own
    // right, which is the mirror the axis guides give away first.
    expect(directionOf("+ML")).toBe(
      worldAxisKey(worldDirectionOf("Left_to_right"))
    );
    expect(directionOf("-ML")).toBe(
      worldAxisKey(worldDirectionOf("Right_to_left"))
    );
    expect(directionOf("+AP")).toBe(
      worldAxisKey(worldDirectionOf("Posterior_to_anterior"))
    );
    expect(directionOf("-AP")).toBe(
      worldAxisKey(worldDirectionOf("Anterior_to_posterior"))
    );
    expect(directionOf("+SI")).toBe(
      worldAxisKey(worldDirectionOf("Inferior_to_superior"))
    );
    expect(directionOf("-SI")).toBe(
      worldAxisKey(worldDirectionOf("Superior_to_inferior"))
    );
  });

  it("keeps the same six world directions under another coordinate system, moving only which label marks each one", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    const ras = collectGuideDirections(globalRenderers(renderers));

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      PIR_DIRECTIONS,
      { kind: "global" },
      PIR_LABELS
    );
    const pir = collectGuideDirections(globalRenderers(renderers));

    // Any orthogonal triple's six signed axes are the same six anatomical
    // directions, so world space never moves - only the labels on it do.
    expect([...new Set(pir.map(guide => guide.direction))].sort()).toEqual(
      [...new Set(ras.map(guide => guide.direction))].sort()
    );
    expect(ras.map(guide => guide.text)).toEqual(pir.map(guide => guide.text));
    // `PIR` reverses the anterior and superior axes, so those two labels swap
    // ends; both frames count the third axis rightward, so `ML` stays put.
    expect(pir.find(guide => guide.text === "+AP")!.direction).toBe(
      ras.find(guide => guide.text === "-AP")!.direction
    );
    expect(pir.find(guide => guide.text === "+SI")!.direction).toBe(
      ras.find(guide => guide.text === "-SI")!.direction
    );
    expect(pir.find(guide => guide.text === "+ML")!.direction).toBe(
      ras.find(guide => guide.text === "+ML")!.direction
    );
  });

  it("swaps which side each ML label sits on when the global system counts leftward, without moving the six world directions", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    const ras = collectGuideDirections(globalRenderers(renderers));

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      LAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    const las = collectGuideDirections(globalRenderers(renderers));

    // Reversing only the left-right axis relabels the animal's two sides and
    // nothing else: `+ML` moves onto the left, `-ML` onto the right, and the
    // world directions the six guides occupy are the same set as before.
    expect([...new Set(las.map(guide => guide.direction))].sort()).toEqual(
      [...new Set(ras.map(guide => guide.direction))].sort()
    );
    expect(las.find(guide => guide.text === "+ML")!.direction).toBe(
      worldAxisKey(worldDirectionOf("Right_to_left"))
    );
    expect(las.find(guide => guide.text === "-ML")!.direction).toBe(
      worldAxisKey(worldDirectionOf("Left_to_right"))
    );
    for (const text of ["+AP", "-AP", "+SI", "-SI"]) {
      expect(las.find(guide => guide.text === text)!.direction).toBe(
        ras.find(guide => guide.text === text)!.direction
      );
    }
  });

  it("puts each pick mesh exactly on its label's quad", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    const facing = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 0, -1), matrix).normalize();
    const pairs: Array<{
      meshName: string;
      line: AnatomicalLine;
      index: 0 | 1;
    }> = [
      { meshName: "axisGuidePick_0+", line: "leftRight", index: 0 },
      { meshName: "axisGuidePick_0-", line: "leftRight", index: 1 },
      { meshName: "axisGuidePick_1+", line: "posteriorAnterior", index: 0 },
      { meshName: "axisGuidePick_1-", line: "posteriorAnterior", index: 1 },
      { meshName: "axisGuidePick_2+", line: "inferiorSuperior", index: 0 },
      { meshName: "axisGuidePick_2-", line: "inferiorSuperior", index: 1 }
    ];

    for (const { meshName, line, index } of pairs) {
      const mesh = scene.getMeshByName(meshName)!;
      const paragraph = renderers[line].paragraphs[index]!;
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

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    for (const mesh of scene.meshes.filter(mesh =>
      mesh.name.startsWith("axisGuidePick_")
    )) {
      const extendSize = mesh.getBoundingInfo().boundingBox.extendSize;
      expectVectorCloseTo(extendSize, new Vector3(2.85, 1.875, 0));
    }
  });

  it("positions each label past its arrow's tip, one atlas extent along its own anatomical line plus the arrow clearance from the scene origin", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    // Each guide sits one atlas extent along its own anatomical line plus the
    // shared 2.625mm arrow-and-gap clearance: 11.4mm left-right, 13.2mm
    // posterior-anterior, 8mm inferior-superior. World space is unchanged by
    // the coordinate system, so each line's `+` end lands on the anatomical
    // direction `RAS` counts positive -- the animal's own right for `ML`.
    const lines: Array<{
      renderer: FakeTextRenderer;
      positive: AnatomicalDirection;
      distance: number;
    }> = [
      {
        renderer: renderers.leftRight,
        positive: "Left_to_right",
        distance: 14.025
      },
      {
        renderer: renderers.posteriorAnterior,
        positive: "Posterior_to_anterior",
        distance: 15.825
      },
      {
        renderer: renderers.inferiorSuperior,
        positive: "Inferior_to_superior",
        distance: 10.625
      }
    ];

    for (const { renderer, positive, distance } of lines) {
      expectVectorCloseTo(
        renderer.paragraphs[0]!.worldMatrix.getTranslation(),
        worldDirectionOf(positive).scale(distance)
      );
      expectVectorCloseTo(
        renderer.paragraphs[1]!.worldMatrix.getTranslation(),
        worldDirectionOf(positive).scale(-distance)
      );
    }
  });

  it("builds a shaft and cone head arrow per label, tip at the label's anchor and pointing outward", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    // `+AP` is the anterior end of the posterior-anterior axis, world +Z.
    const shaftAnterior = scene.getMeshByName("axisGuideArrow_1+")!;
    const headAnterior = scene.getMeshByName("axisGuideArrow_1+_head")!;
    expectVectorCloseTo(shaftAnterior.position, new Vector3(0, 0, 10.66875));
    expectVectorCloseTo(headAnterior.position, new Vector3(0, 0, 12.54375));
    expect(
      shaftAnterior.getBoundingInfo().boundingBox.extendSize.y
    ).toBeCloseTo(1.21875);
    expect(headAnterior.getBoundingInfo().boundingBox.extendSize.y).toBeCloseTo(
      0.65625
    );
    expectVectorCloseTo(worldUp(shaftAnterior), new Vector3(0, 0, 1));
    expectVectorCloseTo(worldUp(headAnterior), new Vector3(0, 0, 1));
    expect(shaftAnterior.isPickable).toBe(false);
    expect(headAnterior.isPickable).toBe(false);

    // `-SI`'s direction (0, -1, 0) is antiparallel to CreateCylinder's local +Y build axis.
    const shaftInferior = scene.getMeshByName("axisGuideArrow_2-")!;
    const headInferior = scene.getMeshByName("axisGuideArrow_2-_head")!;
    expectVectorCloseTo(shaftInferior.position, new Vector3(0, -5.46875, 0));
    expectVectorCloseTo(headInferior.position, new Vector3(0, -7.34375, 0));
    expectVectorCloseTo(worldUp(shaftInferior), new Vector3(0, -1, 0));
    expectVectorCloseTo(worldUp(headInferior), new Vector3(0, -1, 0));
    expect(shaftInferior.isPickable).toBe(false);
    expect(headInferior.isPickable).toBe(false);
  });

  it("colours each anatomical line's arrow material to match its labels, unlit", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    for (const line of Object.keys(
      GLOBAL_FRAME_AXIS_COLORS
    ) as AnatomicalLine[]) {
      const material = scene.getMaterialByName(
        `axisGuideArrow_${line}_material`
      ) as StandardMaterial;
      expect(material).toBeTruthy();
      expect(
        material.emissiveColor.equals(GLOBAL_FRAME_AXIS_COLORS[line])
      ).toBe(true);
      expect(material.disableLighting).toBe(true);
    }
  });

  it("colours a local set from the local palette, which shares no colour with the global one", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);
    const node = new TransformNode("gizmoNode", scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "local", getNode: () => node },
      RAS_LABELS
    );

    for (const [index, color] of LOCAL_FRAME_AXIS_COLORS.entries()) {
      const material = scene.getMaterialByName(
        `axisGuideArrow_localAxis${index}_material`
      ) as StandardMaterial;
      expect(material).toBeTruthy();
      expect(material.emissiveColor.equals(color)).toBe(true);
      expect(material.disableLighting).toBe(true);
      expect(scene.getMeshByName(`axisGuideArrow_${index}+`)!.material).toBe(
        material
      );
      for (const globalColor of Object.values(GLOBAL_FRAME_AXIS_COLORS)) {
        expect(color.equals(globalColor)).toBe(false);
      }
    }
    // A local set draws none of the global lines, so none of their materials exist.
    expect(
      scene.getMaterialByName("axisGuideArrow_leftRight_material")
    ).toBeNull();
  });

  it("keys the arrow colours to the anatomical line, so reordering the coordinate system's axes never recolours a plane", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      PIR_DIRECTIONS,
      { kind: "global" },
      PIR_LABELS
    );

    // `PIR`'s first axis runs posterior-anterior, yet that line stays blue.
    const material = scene.getMaterialByName(
      "axisGuideArrow_posteriorAnterior_material"
    ) as StandardMaterial;
    expect(
      material.emissiveColor.equals(GLOBAL_FRAME_AXIS_COLORS.posteriorAnterior)
    ).toBe(true);
    expect(scene.getMeshByName("axisGuideArrow_0+")!.material).toBe(material);
  });

  it("faces each label's readable side outward along its own signed world axis", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    const facing = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 0, -1), matrix).normalize();

    // The guides in the horizontal plane lie flat, read from above; the
    // vertical pair stands upright, read from the front.
    for (const paragraph of [
      ...renderers.posteriorAnterior.paragraphs,
      ...renderers.leftRight.paragraphs
    ]) {
      expectVectorCloseTo(facing(paragraph.worldMatrix), new Vector3(0, 1, 0));
    }
    for (const paragraph of renderers.inferiorSuperior.paragraphs) {
      expectVectorCloseTo(facing(paragraph.worldMatrix), new Vector3(0, 0, -1));
    }
  });

  it("points each label's top edge towards its own signed axis, except the vertical pair where both point up", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    const topEdge = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 1, 0), matrix).normalize();

    for (const paragraph of [
      ...renderers.posteriorAnterior.paragraphs,
      ...renderers.leftRight.paragraphs
    ]) {
      expectVectorCloseTo(
        topEdge(paragraph.worldMatrix),
        paragraph.worldMatrix.getTranslation().normalize()
      );
    }
    for (const paragraph of renderers.inferiorSuperior.paragraphs) {
      expectVectorCloseTo(topEdge(paragraph.worldMatrix), new Vector3(0, 1, 0));
    }
  });

  it("sizes every label so the widest spans half the atlas's left-right length, tracking the atlas", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    const scale = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).length();

    for (const renderer of globalRenderers(renderers)) {
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
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    expect(scale(renderers.leftRight.paragraphs[0]!.worldMatrix)).toBeCloseTo(
      7.5,
      4
    );
  });

  it("rebuilds idempotently, leaving one root and two paragraphs per global renderer", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    expect(
      scene.transformNodes.filter(node => node.name === "axisGuideRoot_node")
    ).toHaveLength(1);
    for (const renderer of globalRenderers(renderers)) {
      expect(renderer.paragraphs).toHaveLength(2);
    }
  });

  it("builds nothing and clears any existing guides for an atlas with unknown dimensions", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeTruthy();

    buildAxisGuides(
      scene,
      guides,
      makeAtlas({ manifest: makeManifest({ resolutions: [] }) }),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );

    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeNull();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.paragraphs).toHaveLength(0);
      expect(renderer.parent).toBeNull();
    }
  });

  it("draws the local coordinate system's own axes, one renderer per frame axis, not the tracked node's Babylon axes", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    const node = new TransformNode("gizmoNode", scene);
    const longestDimension = Math.max(
      ...getAtlasDimensionsMillimeters(makeAtlas())
    );
    const scale = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).length();

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      {
        kind: "local",
        getNode: () => node
      },
      RAS_LABELS
    );

    expect(renderers.localAxis0.paragraphs.map(p => p.text)).toEqual([
      "+Depth",
      "-Depth"
    ]);
    expect(renderers.localAxis1.paragraphs.map(p => p.text)).toEqual([
      "+Forward",
      "-Forward"
    ]);
    expect(renderers.localAxis2.paragraphs.map(p => p.text)).toEqual([
      "+Right",
      "-Right"
    ]);
    // A local set never borrows the global palette's renderers.
    for (const renderer of globalRenderers(renderers)) {
      expect(renderer.paragraphs).toHaveLength(0);
      expect(renderer.parent).toBeNull();
    }
    expect(
      scene.meshes
        .filter(mesh => mesh.name.startsWith("axisGuidePick_"))
        .map(mesh => mesh.name)
    ).toEqual([
      "axisGuidePick_0+",
      "axisGuidePick_0-",
      "axisGuidePick_1+",
      "axisGuidePick_1-",
      "axisGuidePick_2+",
      "axisGuidePick_2-"
    ]);

    // The electrodes face along the probe body's -Y, so `+Forward` marks -Y:
    // the body's own +Y, which Babylon's green axis would draw, points the
    // opposite way, inferior.
    expectVectorCloseTo(
      renderers.localAxis1.paragraphs[0]!.worldMatrix.getTranslation().normalize(),
      new Vector3(0, -1, 0)
    );

    for (const [index, renderer] of localRenderers(renderers).entries()) {
      const axis = PROBE_LOCAL_AXES[index]!;
      for (const [end, paragraph] of renderer.paragraphs.entries()) {
        const direction = end === 0 ? axis.direction : axis.direction.negate();
        expectVectorCloseTo(
          paragraph.worldMatrix.getTranslation(),
          direction.scale(longestDimension + 0.7 * scale(paragraph.worldMatrix))
        );
      }
    }
  });

  it("orients each local label per the probe-frame convention: the guides along the node's X and Y flat facing +Z, those along its Z upright facing +Y", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    const node = new TransformNode("gizmoNode", scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      {
        kind: "local",
        getNode: () => node
      },
      RAS_LABELS
    );

    const reading = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).normalize();
    const topEdge = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 1, 0), matrix).normalize();
    const facing = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(0, 0, -1), matrix).normalize();

    const paragraphs = localRenderers(renderers).flatMap(
      renderer => renderer.paragraphs
    );
    expect(paragraphs).toHaveLength(6);
    for (const paragraph of paragraphs) {
      const direction = paragraph.worldMatrix.getTranslation().normalize();
      if (Math.abs(direction.z) > 0.5) {
        expectVectorCloseTo(
          facing(paragraph.worldMatrix),
          new Vector3(0, 1, 0)
        );
        expectVectorCloseTo(
          topEdge(paragraph.worldMatrix),
          new Vector3(0, 0, 1)
        );
        expectVectorCloseTo(
          reading(paragraph.worldMatrix),
          new Vector3(1, 0, 0)
        );
        continue;
      }
      expectVectorCloseTo(facing(paragraph.worldMatrix), new Vector3(0, 0, 1));
      expectVectorCloseTo(topEdge(paragraph.worldMatrix), direction);
    }
  });

  it("draws the local set at the global set's em size, with every label anchored beyond the atlas's longest dimension", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);
    const node = new TransformNode("gizmoNode", scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      {
        kind: "local",
        getNode: () => node
      },
      RAS_LABELS
    );

    const scale = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).length();
    for (const renderer of localRenderers(renderers)) {
      for (const paragraph of renderer.paragraphs) {
        expect(scale(paragraph.worldMatrix)).toBeCloseTo(5.7 / 1.52, 4);
      }
    }

    // Longest atlas dimension (13.2mm) plus the shared arrow-clearance-and-label-gap term
    // (2.625mm): every local label anchors the same distance out, regardless of its own axis.
    const allParagraphs = localRenderers(renderers).flatMap(
      renderer => renderer.paragraphs
    );
    for (const axis of PROBE_LOCAL_AXES) {
      for (const sign of ["+", "-"] as const) {
        const paragraph = allParagraphs.find(
          p => p.text === `${sign}${axis.label}`
        )!;
        const direction =
          sign === "+" ? axis.direction : axis.direction.negate();
        expectVectorCloseTo(
          paragraph.worldMatrix.getTranslation(),
          direction.scale(15.825)
        );
      }
    }

    const shaft = scene.getMeshByName("axisGuideArrow_0+")!;
    const head = scene.getMeshByName("axisGuideArrow_0+_head")!;
    const depth = PROBE_LOCAL_AXES[0]!.direction;
    expectVectorCloseTo(shaft.position, depth.scale(10.66875));
    expectVectorCloseTo(head.position, depth.scale(12.54375));
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
    // The inferior-superior axis (500 voxels) is the longest here, unlike the
    // default fixture where posterior-anterior is longest.
    const atlas = makeAtlas({
      manifest: makeManifest({ shape: [[100, 500, 100]] })
    });
    const longestDimension = Math.max(...getAtlasDimensionsMillimeters(atlas));

    buildAxisGuides(
      scene,
      guides,
      atlas,
      RAS_DIRECTIONS,
      {
        kind: "local",
        getNode: () => node
      },
      RAS_LABELS
    );

    const scale = (matrix: Matrix) =>
      Vector3.TransformNormal(new Vector3(1, 0, 0), matrix).length();
    for (const renderer of localRenderers(renderers)) {
      for (const paragraph of renderer.paragraphs) {
        const labelScale = scale(paragraph.worldMatrix);
        const distance = paragraph.worldMatrix.getTranslation().length();
        expect(distance).toBeCloseTo(longestDimension + 0.7 * labelScale, 4);
      }
    }
  });

  it("draws a renamed axis's label with the user's name, leaving the other axes' labels and mesh names unchanged", () => {
    const scene = makeTestScene();
    const { renderers, guides } = makeTestAxisGuides(scene);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      { ...RAS_LABELS, global: ["ML", "PAXAP", "SI"] }
    );

    expect(renderers.posteriorAnterior.paragraphs.map(p => p.text)).toEqual([
      "+PAXAP",
      "-PAXAP"
    ]);
    expect(renderers.leftRight.paragraphs.map(p => p.text)).toEqual([
      "+ML",
      "-ML"
    ]);
    expect(renderers.inferiorSuperior.paragraphs.map(p => p.text)).toEqual([
      "+SI",
      "-SI"
    ]);
    // Mesh names are keyed to the axis index, so a rename never renames a mesh.
    expect(scene.getMeshByName("axisGuidePick_1+")).toBeTruthy();
    expect(scene.getMeshByName("axisGuidePick_1-")).toBeTruthy();
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

  buildAxisGuides(
    scene,
    guides,
    makeAtlas(),
    RAS_DIRECTIONS,
    {
      kind: "local",
      getNode: () => node
    },
    RAS_LABELS
  );
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
    const mesh = scene.getMeshByName("axisGuidePick_0+")!;
    // Forcing the mesh's world matrix cascades up to its parent, the root.
    mesh.computeWorldMatrix(true);

    expect(
      root.absoluteRotationQuaternion.equalsWithEpsilon(
        node.absoluteRotationQuaternion
      )
    ).toBe(true);
    // `+Depth` lies along the node's -Z, which a quarter turn of yaw swings
    // onto world -X.
    expectVectorCloseTo(
      mesh.absolutePosition.normalize(),
      new Vector3(-1, 0, 0)
    );
  });

  it("picks the tracked node's rotated world direction, not its frame-local one", () => {
    const { scene, camera } = makeRotatedLocalFrameScene();
    const screen = projectPickMeshToScreen(scene, camera, "axisGuidePick_0+");

    const picked = pickAxisGuideDirection(scene, screen.x, screen.y);

    expect(picked).not.toBeNull();
    expectVectorCloseTo(picked!, new Vector3(-1, 0, 0));
  });

  it("re-resolves the tracked node after it is rebuilt, and releases the observer on clear", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);
    let nodeA: TransformNode | null = new TransformNode("a", scene);
    const nodeB = new TransformNode("b", scene);
    nodeB.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI, 0, 0);

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      {
        kind: "local",
        getNode: () => nodeA ?? nodeB
      },
      RAS_LABELS
    );
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

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      {
        kind: "local",
        getNode: () => current
      },
      RAS_LABELS
    );
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
    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    expect(scene.meshes).toHaveLength(18);

    clearAxisGuides(scene, guides);

    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeNull();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    for (const renderer of Object.values(renderers)) {
      expect(renderer.paragraphs).toHaveLength(0);
      expect(renderer.parent).toBeNull();
    }

    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeTruthy();
    expect(scene.meshes).toHaveLength(18);
    for (const renderer of globalRenderers(renderers)) {
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
  it("returns the world direction of the axis guide label under a screen position", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);
    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
    const camera = new ArcRotateCamera(
      "c",
      -Math.PI / 2,
      Math.PI / 8,
      50,
      Vector3.Zero(),
      scene
    );
    scene.activeCamera = camera;

    // `RAS` axis 0 is the left-right one, so its `+` guide marks the animal's
    // right; axis 1 is anterior-positive and axis 2 superior-positive.
    const cases: Array<{ meshName: string; direction: AnatomicalDirection }> = [
      { meshName: "axisGuidePick_0+", direction: "Left_to_right" },
      { meshName: "axisGuidePick_0-", direction: "Right_to_left" },
      { meshName: "axisGuidePick_1+", direction: "Posterior_to_anterior" },
      { meshName: "axisGuidePick_1-", direction: "Anterior_to_posterior" },
      { meshName: "axisGuidePick_2+", direction: "Inferior_to_superior" },
      { meshName: "axisGuidePick_2-", direction: "Superior_to_inferior" }
    ];

    for (const { meshName, direction } of cases) {
      const screen = projectPickMeshToScreen(scene, camera, meshName);
      const picked = pickAxisGuideDirection(scene, screen.x, screen.y);
      expect(picked).not.toBeNull();
      expectVectorCloseTo(picked!, worldDirectionOf(direction));
    }
  });

  it("returns null when no axis guide label is under the screen position", () => {
    const scene = makeTestScene();
    const { guides } = makeTestAxisGuides(scene);
    buildAxisGuides(
      scene,
      guides,
      makeAtlas(),
      RAS_DIRECTIONS,
      { kind: "global" },
      RAS_LABELS
    );
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
