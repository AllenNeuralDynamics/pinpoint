import {
  Color3,
  Matrix,
  MeshBuilder,
  Quaternion,
  TransformNode
} from "@babylonjs/core";
import type {
  AbstractEngine,
  Color4,
  IMatrixLike,
  Scene,
  Vector3
} from "@babylonjs/core";
import { FontAsset, SdfTextParagraph, TextRenderer } from "@babylonjs/addons";
import type { INodeLike, ParagraphOptions } from "@babylonjs/addons";
import axios from "axios";
import { type Atlas, getAtlasDimensionsMillimeters } from "@/features/atlas";
import { asrToBabylon } from "./coordinate-transforms.api";

/** Atlas axis an axis guide marks. */
export type AxisGuideAxis = "ap" | "dv" | "ml";

/** MSDF text renderer surface the axis guides drive. */
export interface AxisGuideTextRenderer {
  parent: INodeLike | null;
  addParagraph(
    text: string,
    options?: Partial<ParagraphOptions>,
    worldMatrix?: IMatrixLike
  ): void;
  clearParagraphs(): void;
}

/** Text renderers and font asset the axis guide labels are drawn with. */
export interface AxisGuides {
  renderers: Record<AxisGuideAxis, AxisGuideTextRenderer>;
  fontAsset: FontAsset;
  /** Release the renderers, the font asset, and the per-frame draw hook. */
  dispose: () => void;
}

/** One axis guide: which axis, which end, its label, and its orientation. */
interface AxisGuideSpec {
  axis: AxisGuideAxis;
  sign: 1 | -1;
  text: string;
  /** Euler rotation in radians, in Babylon's yaw-pitch-roll order. */
  rotation: { pitch: number; yaw: number; roll: number };
}

const AXIS_GUIDE_ROOT_NODE_NAME = "axisGuideRoot_node";

/** Babylon's Roboto MSDF font definition and its glyph atlas. */
const AXIS_GUIDE_FONT_DEFINITION_URL =
  "https://assets.babylonjs.com/fonts/roboto-regular.json";
const AXIS_GUIDE_FONT_TEXTURE_URL =
  "https://assets.babylonjs.com/fonts/roboto-regular.png";

/** Index of each axis in an ASR coordinate triple. */
const AXIS_GUIDE_ASR_INDEX: Record<AxisGuideAxis, 0 | 1 | 2> = {
  ap: 0,
  dv: 1,
  ml: 2
};

/** Label colour per axis: AP blue, DV green, ML red (Babylon's gizmo axes). */
const AXIS_GUIDE_COLORS: Record<AxisGuideAxis, Color4> = {
  ap: Color3.Blue().toColor4(),
  dv: Color3.Green().toColor4(),
  ml: Color3.Red().toColor4()
};

/**
 * The six guides. MSDF text is legible from its local -Z side, with local +X
 * its reading direction and local +Y its top edge: a quarter-turn pitch lays
 * the AP and ML labels flat in the AP/ML plane facing -DV (world +Y), where
 * yaw turns each label's top edge towards its own signed axis; the DV labels
 * stay upright in the DV/ML plane, facing +AP (world -Z) with their top edge
 * already towards -DV.
 */
const AXIS_GUIDE_SPECS: AxisGuideSpec[] = [
  {
    axis: "ap",
    sign: 1,
    text: "+AP",
    rotation: { pitch: Math.PI / 2, yaw: Math.PI, roll: 0 }
  },
  {
    axis: "ap",
    sign: -1,
    text: "-AP",
    rotation: { pitch: Math.PI / 2, yaw: 0, roll: 0 }
  },
  {
    axis: "dv",
    sign: 1,
    text: "+DV",
    rotation: { pitch: 0, yaw: 0, roll: 0 }
  },
  {
    axis: "dv",
    sign: -1,
    text: "-DV",
    rotation: { pitch: 0, yaw: 0, roll: 0 }
  },
  {
    axis: "ml",
    sign: 1,
    text: "+ML",
    rotation: { pitch: Math.PI / 2, yaw: Math.PI / 2, roll: 0 }
  },
  {
    axis: "ml",
    sign: -1,
    text: "-ML",
    rotation: { pitch: Math.PI / 2, yaw: -Math.PI / 2, roll: 0 }
  }
];

/** Widest label's width, as a fraction of the atlas's ML length. */
const AXIS_GUIDE_WIDTH_ML_FRACTION = 0.5;

const AXIS_GUIDE_PICK_MESH_NAME_PREFIX = "axisGuidePick_";

/** Metadata on an axis guide's pick mesh: the direction its label marks. */
interface AxisGuidePickMetadata {
  direction: Vector3;
}

/**
 * Load the MSDF font and create one text renderer per axis, drawn after every
 * frame of the scene. Rejects, leaving nothing behind, if the font definition
 * cannot be fetched or the renderers cannot be created.
 * @param scene Scene the renderers draw in.
 */
export async function createAxisGuides(scene: Scene): Promise<AxisGuides> {
  const definition = await axios.get<string>(AXIS_GUIDE_FONT_DEFINITION_URL, {
    responseType: "text"
  });
  const fontAsset = new FontAsset(
    definition.data,
    AXIS_GUIDE_FONT_TEXTURE_URL,
    scene
  );

  const engine = scene.getEngine();

  let renderers: Record<AxisGuideAxis, TextRenderer>;
  try {
    const [ap, dv, ml] = await Promise.all([
      createTextRenderer(engine, fontAsset, AXIS_GUIDE_COLORS.ap),
      createTextRenderer(engine, fontAsset, AXIS_GUIDE_COLORS.dv),
      createTextRenderer(engine, fontAsset, AXIS_GUIDE_COLORS.ml)
    ]);
    renderers = { ap, dv, ml };
  } catch (error) {
    fontAsset.dispose();
    throw error;
  }

  // Text renderers are not scene nodes, so Babylon never draws them: render
  // each one after the scene with the active camera's matrices. Skip a
  // renderer with no paragraphs (`parent` nulled by `clearAxisGuides`):
  // `TextRenderer.render()` always issues a draw call, and Babylon's
  // engine falls back to a *non-instanced* draw of one quad when the
  // instance count is 0, redrawing a stale glyph instead of nothing.
  const observer = scene.onAfterRenderObservable.add(() => {
    const camera = scene.activeCamera;
    if (!camera) return;

    for (const renderer of Object.values(renderers)) {
      if (!renderer.parent) continue;
      renderer.render(camera.getViewMatrix(), camera.getProjectionMatrix());
    }
  });

  return {
    renderers,
    fontAsset,
    dispose: () => {
      observer.remove();
      for (const renderer of Object.values(renderers)) renderer.dispose();
      fontAsset.dispose();
    }
  };
}

/**
 * Rebuild the atlas's six axis guide labels and their pick meshes, replacing
 * any existing ones.
 * @param scene Scene holding the axis guide root node.
 * @param guides Text renderers and font asset to draw the labels with.
 * @param atlas Atlas supplying the atlas's dimensions.
 */
export function buildAxisGuides(
  scene: Scene,
  guides: AxisGuides,
  atlas: Atlas
): void {
  clearAxisGuides(scene, guides);

  const dimensions = getAtlasDimensionsMillimeters(atlas);
  const mlLength = dimensions[AXIS_GUIDE_ASR_INDEX.ml];
  if (mlLength === 0) return;

  const labelSizes: Record<string, { width: number; height: number }> =
    Object.fromEntries(
      AXIS_GUIDE_SPECS.map(spec => [
        spec.text,
        labelSizeEm(spec.text, guides.fontAsset)
      ])
    );

  // `setAtlasCenterOffset` keeps the atlas center on the scene origin, so the
  // guides are placed straight in world space around that origin.
  const root = new TransformNode(AXIS_GUIDE_ROOT_NODE_NAME, scene);
  const fontSize = axisGuideFontSize(mlLength, labelSizes);

  for (const spec of AXIS_GUIDE_SPECS) {
    const renderer = guides.renderers[spec.axis];
    renderer.parent = root;
    renderer.addParagraph(
      spec.text,
      undefined,
      axisGuideMatrix(spec, dimensions, fontSize)
    );
    buildAxisGuidePickMesh(
      scene,
      root,
      spec,
      dimensions,
      fontSize,
      labelSizes[spec.text]!
    );
  }
}

/**
 * Remove every axis guide label and pick mesh, and the root node they hang
 * from, if built.
 * @param scene Scene to remove the axis guide root node from.
 * @param guides Text renderers to clear the labels from.
 */
export function clearAxisGuides(scene: Scene, guides: AxisGuides): void {
  scene.getTransformNodeByName(AXIS_GUIDE_ROOT_NODE_NAME)?.dispose();
  for (const renderer of Object.values(guides.renderers)) {
    renderer.clearParagraphs();
    renderer.parent = null;
  }
}

/**
 * Create one colored MSDF text renderer.
 * @param engine Engine the renderer compiles against.
 * @param fontAsset Font asset the renderer draws with.
 * @param color Color the renderer draws its text in.
 */
async function createTextRenderer(
  engine: AbstractEngine,
  fontAsset: FontAsset,
  color: Color4
): Promise<TextRenderer> {
  const renderer = await TextRenderer.CreateTextRendererAsync(
    fontAsset,
    engine
  );
  renderer.color = color;
  return renderer;
}

/**
 * Unit world direction the given guide's label sits along.
 * @param spec Axis guide to take the direction of.
 */
function axisGuideDirection(spec: AxisGuideSpec): Vector3 {
  const offset: [number, number, number] = [0, 0, 0];
  offset[AXIS_GUIDE_ASR_INDEX[spec.axis]] = spec.sign;
  return asrToBabylon(offset);
}

/**
 * Paragraph world matrix scaling, orienting, and placing one label one atlas
 * dimension along its own signed axis from the scene origin.
 * @param spec Axis guide to place.
 * @param dimensions Atlas dimensions in mm as [ap, dv, ml].
 * @param fontSize Label em size in mm.
 */
function axisGuideMatrix(
  spec: AxisGuideSpec,
  dimensions: [number, number, number],
  fontSize: number
): Matrix {
  const position = axisGuideDirection(spec).scale(
    dimensions[AXIS_GUIDE_ASR_INDEX[spec.axis]]
  );

  return Matrix.Scaling(fontSize, fontSize, 1)
    .multiply(
      Matrix.RotationYawPitchRoll(
        spec.rotation.yaw,
        spec.rotation.pitch,
        spec.rotation.roll
      )
    )
    .multiply(Matrix.Translation(position.x, position.y, position.z));
}

/**
 * Create one axis guide's invisible pick mesh, covering its label's quad and
 * carrying the world direction that label marks.
 * @param scene Scene to create the mesh in.
 * @param root Axis guide root node to parent the mesh to.
 * @param spec Axis guide the mesh stands in for.
 * @param dimensions Atlas dimensions in mm as [ap, dv, ml].
 * @param fontSize Label em size in mm.
 * @param labelSize Label's measured width and height in em.
 */
function buildAxisGuidePickMesh(
  scene: Scene,
  root: TransformNode,
  spec: AxisGuideSpec,
  dimensions: [number, number, number],
  fontSize: number,
  labelSize: { width: number; height: number }
): void {
  const { width, height } = labelSize;
  const direction = axisGuideDirection(spec);
  const mesh = MeshBuilder.CreatePlane(
    `${AXIS_GUIDE_PICK_MESH_NAME_PREFIX}${spec.text}`,
    { width: width * fontSize, height: height * fontSize },
    scene
  );
  mesh.parent = root;
  mesh.position = direction.scale(dimensions[AXIS_GUIDE_ASR_INDEX[spec.axis]]);
  mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(
    spec.rotation.yaw,
    spec.rotation.pitch,
    spec.rotation.roll
  );
  // Never rendered: the label itself is drawn by the text renderer. A custom
  // pick predicate reaches it regardless of `isVisible`.
  mesh.isVisible = false;
  mesh.metadata = { direction } satisfies AxisGuidePickMetadata;
}

/**
 * World direction marked by the axis guide label under a screen position, or
 * null when no label is there.
 * @param scene Scene holding the axis guide pick meshes.
 * @param x Horizontal screen position, in canvas pixels.
 * @param y Vertical screen position, in canvas pixels.
 */
export function pickAxisGuideDirection(
  scene: Scene,
  x: number,
  y: number
): Vector3 | null {
  const { pickedMesh } = scene.pick(x, y, mesh =>
    mesh.name.startsWith(AXIS_GUIDE_PICK_MESH_NAME_PREFIX)
  );
  const metadata = pickedMesh?.metadata as AxisGuidePickMetadata | undefined;
  return metadata?.direction ?? null;
}

/**
 * Em size in mm making the widest label exactly half the atlas's ML length.
 * @param mlLength Atlas ML extent in mm.
 * @param labelSizes Each label's measured size in em, keyed by text.
 */
function axisGuideFontSize(
  mlLength: number,
  labelSizes: Record<string, { width: number; height: number }>
): number {
  const widest = Math.max(
    ...AXIS_GUIDE_SPECS.map(spec => labelSizes[spec.text]!.width)
  );
  return (mlLength * AXIS_GUIDE_WIDTH_ML_FRACTION) / widest;
}

/**
 * Width and height of a label in em, from the same layout engine that
 * renders it.
 * @param text Label text to measure.
 * @param fontAsset Font asset the label is laid out with.
 */
function labelSizeEm(
  text: string,
  fontAsset: FontAsset
): { width: number; height: number } {
  const paragraph = new SdfTextParagraph(text, fontAsset);
  return {
    width: paragraph.width * fontAsset.scale,
    height: paragraph.height * fontAsset.scale
  };
}
