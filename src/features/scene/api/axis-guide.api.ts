import {
  Color3,
  Matrix,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import type {
  AbstractEngine,
  Color4,
  IMatrixLike,
  Scene
} from "@babylonjs/core";
import { FontAsset, SdfTextParagraph, TextRenderer } from "@babylonjs/addons";
import type { INodeLike, ParagraphOptions } from "@babylonjs/addons";
import axios from "axios";
import { type Atlas, getAtlasDimensionsMillimeters } from "@/features/atlas";

/** Atlas axis an axis guide marks. */
export type AxisGuideAxis = "ap" | "dv" | "ml";

/** Axis a guide's label text is keyed to: an atlas ASR axis, or a Babylon axis in the local frame. */
export type AxisGuideLabelKey = AxisGuideAxis | "x" | "y" | "z";

/** Label text per axis, sign excluded — the user's axis names for the atlas axes. */
export type AxisGuideLabels = Record<AxisGuideLabelKey, string>;

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

/**
 * Frame the axis guides are drawn in: the atlas's ASR axes, or the Babylon axes of the node the
 * getter resolves.
 */
export type AxisGuideFrame =
  | { kind: "global" }
  | { kind: "local"; getNode: () => TransformNode | null };

/** One axis guide: which axis it is keyed to, where it sits, its label, and its orientation. */
interface AxisGuideSpec {
  /** Text renderer, colour, and atlas dimension the guide is keyed to. */
  axis: AxisGuideAxis;
  /** Unit direction, in the guide root's space, the guide sits along. */
  direction: Vector3;
  /** Which axis label the guide's text is built from. */
  labelKey: AxisGuideLabelKey;
  /** Sign prefixed to the label. */
  sign: "+" | "-";
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

/** Label and arrow colour per axis: AP blue, DV green, ML red (Babylon's gizmo axes). */
const AXIS_GUIDE_COLORS: Record<AxisGuideAxis, Color3> = {
  ap: Color3.Blue(),
  dv: Color3.Green(),
  ml: Color3.Red()
};

/**
 * The six global guides, labelled in atlas ASR axes. MSDF text is legible from its local -Z
 * side, with local +X its reading direction and local +Y its top edge: a quarter-turn pitch lays
 * the AP and ML labels flat in the AP/ML plane facing -DV (world +Y), where yaw turns each
 * label's top edge towards its own signed axis; the DV labels stay upright in the DV/ML plane,
 * facing +AP (world -Z) with their top edge already towards -DV.
 */
const AXIS_GUIDE_GLOBAL_SPECS: AxisGuideSpec[] = [
  {
    axis: "ap",
    direction: new Vector3(0, 0, -1),
    labelKey: "ap",
    sign: "+",
    rotation: { pitch: Math.PI / 2, yaw: Math.PI, roll: 0 }
  },
  {
    axis: "ap",
    direction: new Vector3(0, 0, 1),
    labelKey: "ap",
    sign: "-",
    rotation: { pitch: Math.PI / 2, yaw: 0, roll: 0 }
  },
  {
    axis: "dv",
    direction: new Vector3(0, -1, 0),
    labelKey: "dv",
    sign: "+",
    rotation: { pitch: 0, yaw: 0, roll: 0 }
  },
  {
    axis: "dv",
    direction: new Vector3(0, 1, 0),
    labelKey: "dv",
    sign: "-",
    rotation: { pitch: 0, yaw: 0, roll: 0 }
  },
  {
    axis: "ml",
    direction: new Vector3(1, 0, 0),
    labelKey: "ml",
    sign: "+",
    rotation: { pitch: Math.PI / 2, yaw: Math.PI / 2, roll: 0 }
  },
  {
    axis: "ml",
    direction: new Vector3(-1, 0, 0),
    labelKey: "ml",
    sign: "-",
    rotation: { pitch: Math.PI / 2, yaw: -Math.PI / 2, roll: 0 }
  }
];

/**
 * The six local guides, labelled in Babylon axes and coloured like Babylon's transform gizmos
 * (X red, Y green, Z blue): each local guide reuses its Babylon axis's counterpart renderer and
 * atlas dimension for its gizmo colour (X red = ML, Y green = DV, Z blue = AP). Drawn as the
 * global convention with +Z as the up axis: `+X`/`-X` and `+Y`/`-Y` lie flat in the local X/Y
 * plane facing +Z with each top edge radiating outward along its own signed axis; `+Z`/`-Z`
 * stand upright in the local Z/X plane facing +Y with both top edges toward +Z.
 */
const AXIS_GUIDE_LOCAL_SPECS: AxisGuideSpec[] = [
  {
    axis: "ml",
    direction: new Vector3(1, 0, 0),
    labelKey: "x",
    sign: "+",
    rotation: { pitch: Math.PI, yaw: 0, roll: -Math.PI / 2 }
  },
  {
    axis: "ml",
    direction: new Vector3(-1, 0, 0),
    labelKey: "x",
    sign: "-",
    rotation: { pitch: Math.PI, yaw: 0, roll: Math.PI / 2 }
  },
  {
    axis: "dv",
    direction: new Vector3(0, 1, 0),
    labelKey: "y",
    sign: "+",
    rotation: { pitch: 0, yaw: Math.PI, roll: 0 }
  },
  {
    axis: "dv",
    direction: new Vector3(0, -1, 0),
    labelKey: "y",
    sign: "-",
    rotation: { pitch: Math.PI, yaw: 0, roll: 0 }
  },
  {
    axis: "ap",
    direction: new Vector3(0, 0, 1),
    labelKey: "z",
    sign: "+",
    rotation: { pitch: Math.PI / 2, yaw: 0, roll: 0 }
  },
  {
    axis: "ap",
    direction: new Vector3(0, 0, -1),
    labelKey: "z",
    sign: "-",
    rotation: { pitch: Math.PI / 2, yaw: 0, roll: 0 }
  }
];

/** Widest global label's width, as a fraction of the atlas's ML length. */
const AXIS_GUIDE_WIDTH_ML_FRACTION = 0.5;

const AXIS_GUIDE_PICK_MESH_NAME_PREFIX = "axisGuidePick_";

/** Prefix of an axis guide arrow's mesh and material names. */
const AXIS_GUIDE_ARROW_MESH_NAME_PREFIX = "axisGuideArrow_";
/** Suffix naming an arrow's cone head; the shaft carries the bare guide name. */
const AXIS_GUIDE_ARROW_HEAD_SUFFIX = "_head";
/** Suffix applied to an axis's arrow material name. */
const AXIS_GUIDE_ARROW_MATERIAL_SUFFIX = "_material";
/** Arrow length, shaft plus head, in label em. */
const AXIS_GUIDE_ARROW_LENGTH_EM = 1;
/** Arrow cone head length, in label em. */
const AXIS_GUIDE_ARROW_HEAD_LENGTH_EM = 0.35;
/** Arrow shaft diameter, in label em. */
const AXIS_GUIDE_ARROW_SHAFT_DIAMETER_EM = 0.08;
/** Arrow cone head base diameter, in label em. */
const AXIS_GUIDE_ARROW_HEAD_DIAMETER_EM = 0.28;
/** Gap between an arrow's tip and its label's near edge, in label em. */
const AXIS_GUIDE_ARROW_LABEL_GAP_EM = 0.2;
/** Radial segments of an arrow's shaft and head. */
const AXIS_GUIDE_ARROW_TESSELLATION = 8;

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
      createTextRenderer(engine, fontAsset, AXIS_GUIDE_COLORS.ap.toColor4()),
      createTextRenderer(engine, fontAsset, AXIS_GUIDE_COLORS.dv.toColor4()),
      createTextRenderer(engine, fontAsset, AXIS_GUIDE_COLORS.ml.toColor4())
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
 * Label text drawn for one guide: its sign followed by its axis's name.
 * @param spec Axis guide to label.
 * @param labels Label text per axis.
 */
function axisGuideText(spec: AxisGuideSpec, labels: AxisGuideLabels): string {
  return `${spec.sign}${labels[spec.labelKey]}`;
}

/**
 * Rebuild the atlas's six axis guide labels, their arrows, and their pick meshes, replacing any
 * existing ones.
 * @param scene Scene holding the axis guide root node.
 * @param guides Text renderers and font asset to draw the labels with.
 * @param atlas Atlas supplying the atlas's dimensions.
 * @param frame Frame to draw the guides in: the atlas's own axes, or a node's Babylon axes.
 * @param labels Label text per axis, from the user's axis-name preferences.
 */
export function buildAxisGuides(
  scene: Scene,
  guides: AxisGuides,
  atlas: Atlas,
  frame: AxisGuideFrame,
  labels: AxisGuideLabels
): void {
  clearAxisGuides(scene, guides);

  const specs =
    frame.kind === "local" ? AXIS_GUIDE_LOCAL_SPECS : AXIS_GUIDE_GLOBAL_SPECS;
  const dimensions = getAtlasDimensionsMillimeters(atlas);
  const mlLength = dimensions[AXIS_GUIDE_ASR_INDEX.ml];
  if (mlLength === 0) return;

  const specTexts = specs.map(spec => ({
    spec,
    text: axisGuideText(spec, labels)
  }));
  const labelSizes: Record<string, { width: number; height: number }> =
    Object.fromEntries(
      specTexts.map(({ text }) => [text, labelSizeEm(text, guides.fontAsset)])
    );

  // `setAtlasCenterOffset` keeps the atlas center on the scene origin, so the
  // guides are placed straight in world space around that origin.
  const root = new TransformNode(AXIS_GUIDE_ROOT_NODE_NAME, scene);
  const fontSize = axisGuideFontSize(
    mlLength,
    guides.fontAsset,
    AXIS_GUIDE_GLOBAL_SPECS.map(spec => axisGuideText(spec, labels))
  );
  const materials = buildAxisGuideArrowMaterials(scene);
  if (frame.kind === "local")
    trackAxisGuideLocalFrame(scene, root, frame.getNode);

  // Local guides rotate with the probe, so an axis-specific anchor (as global uses) can land
  // inside the atlas once rotated; anchoring every local guide at the longest atlas dimension
  // keeps them outside the atlas at any orientation.
  const localAnchor = Math.max(...dimensions);
  for (const { spec, text } of specTexts) {
    const labelSize = labelSizes[text]!;
    const anchor =
      frame.kind === "local"
        ? localAnchor
        : dimensions[AXIS_GUIDE_ASR_INDEX[spec.axis]];
    const labelCenter = spec.direction.scale(
      anchor + (AXIS_GUIDE_ARROW_LABEL_GAP_EM + labelSize.height / 2) * fontSize
    );

    const renderer = guides.renderers[spec.axis];
    renderer.parent = root;
    renderer.addParagraph(
      text,
      undefined,
      axisGuideMatrix(spec, labelCenter, fontSize)
    );
    buildAxisGuidePickMesh(
      scene,
      root,
      spec,
      text,
      labelCenter,
      fontSize,
      labelSize
    );
    buildAxisGuideArrow(
      scene,
      root,
      spec,
      text,
      anchor,
      fontSize,
      materials[spec.axis]
    );
  }
}

/**
 * Remove every axis guide label, arrow, and pick mesh, and the root node they
 * hang from, if built.
 * @param scene Scene to remove the axis guide root node from.
 * @param guides Text renderers to clear the labels from.
 */
export function clearAxisGuides(scene: Scene, guides: AxisGuides): void {
  scene.getTransformNodeByName(AXIS_GUIDE_ROOT_NODE_NAME)?.dispose();
  for (const axis of Object.keys(AXIS_GUIDE_ASR_INDEX) as AxisGuideAxis[]) {
    scene
      .getMaterialByName(
        `${AXIS_GUIDE_ARROW_MESH_NAME_PREFIX}${axis}${AXIS_GUIDE_ARROW_MATERIAL_SUFFIX}`
      )
      ?.dispose();
  }
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
 * Paragraph world matrix scaling, orienting, and placing one label at its centre.
 * @param spec Axis guide to place.
 * @param labelCenter Label's centre position, in the guide root's space.
 * @param fontSize Label em size in mm.
 */
function axisGuideMatrix(
  spec: AxisGuideSpec,
  labelCenter: Vector3,
  fontSize: number
): Matrix {
  return Matrix.Scaling(fontSize, fontSize, 1)
    .multiply(
      Matrix.RotationYawPitchRoll(
        spec.rotation.yaw,
        spec.rotation.pitch,
        spec.rotation.roll
      )
    )
    .multiply(Matrix.Translation(labelCenter.x, labelCenter.y, labelCenter.z));
}

/**
 * Create one axis guide's invisible pick mesh, covering its label's quad and
 * carrying the frame-local direction that label marks.
 * @param scene Scene to create the mesh in.
 * @param root Axis guide root node to parent the mesh to.
 * @param spec Axis guide the mesh stands in for.
 * @param text Resolved label text, from the user's axis-name preferences.
 * @param labelCenter Label's centre position, in the guide root's space.
 * @param fontSize Label em size in mm.
 * @param labelSize Label's measured width and height in em.
 */
function buildAxisGuidePickMesh(
  scene: Scene,
  root: TransformNode,
  spec: AxisGuideSpec,
  text: string,
  labelCenter: Vector3,
  fontSize: number,
  labelSize: { width: number; height: number }
): void {
  const { width, height } = labelSize;
  const mesh = MeshBuilder.CreatePlane(
    `${AXIS_GUIDE_PICK_MESH_NAME_PREFIX}${text}`,
    { width: width * fontSize, height: height * fontSize },
    scene
  );
  mesh.parent = root;
  mesh.position = labelCenter;
  mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(
    spec.rotation.yaw,
    spec.rotation.pitch,
    spec.rotation.roll
  );
  // Never rendered: the label itself is drawn by the text renderer. A custom
  // pick predicate reaches it regardless of `isVisible`.
  mesh.isVisible = false;
  mesh.metadata = {
    direction: spec.direction.clone()
  } satisfies AxisGuidePickMetadata;
}

/**
 * Create one axis guide's arrow: a shaft cylinder and a cone head, tip at the guide's anchor
 * distance and pointing outward along its direction.
 * @param scene Scene to create the meshes in.
 * @param root Axis guide root node to parent the arrow meshes to.
 * @param spec Axis guide the arrow marks.
 * @param text Resolved label text, from the user's axis-name preferences.
 * @param anchor Distance from the origin the arrow's tip sits at, in mm.
 * @param fontSize Label em size in mm.
 * @param material Emissive material shared with the axis's other arrow.
 */
function buildAxisGuideArrow(
  scene: Scene,
  root: TransformNode,
  spec: AxisGuideSpec,
  text: string,
  anchor: number,
  fontSize: number,
  material: StandardMaterial
): void {
  const shaftName = `${AXIS_GUIDE_ARROW_MESH_NAME_PREFIX}${text}`;

  const shaft = MeshBuilder.CreateCylinder(
    shaftName,
    {
      diameter: AXIS_GUIDE_ARROW_SHAFT_DIAMETER_EM * fontSize,
      height:
        (AXIS_GUIDE_ARROW_LENGTH_EM - AXIS_GUIDE_ARROW_HEAD_LENGTH_EM) *
        fontSize,
      tessellation: AXIS_GUIDE_ARROW_TESSELLATION
    },
    scene
  );
  shaft.parent = root;
  shaft.material = material;
  shaft.isPickable = false;
  shaft.position = spec.direction.scale(
    anchor -
      ((AXIS_GUIDE_ARROW_LENGTH_EM + AXIS_GUIDE_ARROW_HEAD_LENGTH_EM) / 2) *
        fontSize
  );
  shaft.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
    Vector3.Up(),
    spec.direction,
    new Quaternion()
  );

  const head = MeshBuilder.CreateCylinder(
    `${shaftName}${AXIS_GUIDE_ARROW_HEAD_SUFFIX}`,
    {
      diameterTop: 0,
      diameterBottom: AXIS_GUIDE_ARROW_HEAD_DIAMETER_EM * fontSize,
      height: AXIS_GUIDE_ARROW_HEAD_LENGTH_EM * fontSize,
      tessellation: AXIS_GUIDE_ARROW_TESSELLATION
    },
    scene
  );
  head.parent = root;
  head.material = material;
  head.isPickable = false;
  head.position = spec.direction.scale(
    anchor - (AXIS_GUIDE_ARROW_HEAD_LENGTH_EM / 2) * fontSize
  );
  head.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
    Vector3.Up(),
    spec.direction,
    new Quaternion()
  );
}

/**
 * Build one unlit emissive material per axis for the guide arrows.
 * @param scene Scene to create the materials in.
 */
function buildAxisGuideArrowMaterials(
  scene: Scene
): Record<AxisGuideAxis, StandardMaterial> {
  const axes = Object.keys(AXIS_GUIDE_ASR_INDEX) as AxisGuideAxis[];
  return Object.fromEntries(
    axes.map(axis => {
      const material = new StandardMaterial(
        `${AXIS_GUIDE_ARROW_MESH_NAME_PREFIX}${axis}${AXIS_GUIDE_ARROW_MATERIAL_SUFFIX}`,
        scene
      );
      material.emissiveColor = AXIS_GUIDE_COLORS[axis];
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.disableLighting = true;
      return [axis, material];
    })
  ) as Record<AxisGuideAxis, StandardMaterial>;
}

/**
 * Keep the guide root's rotation on the node the getter resolves, re-resolving every frame,
 * until the root is disposed.
 * @param scene Scene whose frames drive the tracking.
 * @param root Axis guide root node to rotate.
 * @param getNode Resolves the node whose Babylon axes the guides follow.
 */
function trackAxisGuideLocalFrame(
  scene: Scene,
  root: TransformNode,
  getNode: () => TransformNode | null
): void {
  const rotation = new Quaternion();
  root.rotationQuaternion = rotation;
  const observer = scene.onBeforeRenderObservable.add(() => {
    const node = getNode();
    if (!node) return;

    rotation.copyFrom(node.absoluteRotationQuaternion);
    // Re-assigning marks the root dirty; mutating the quaternion in place alone leaves the
    // cached world matrix stale.
    root.rotationQuaternion = rotation;
  });
  root.onDisposeObservable.addOnce(() => observer.remove(true));
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
  const root = pickedMesh?.parent;
  if (!metadata || !root) return null;

  return Vector3.TransformNormal(
    metadata.direction,
    root.getWorldMatrix()
  ).normalize();
}

/**
 * Em size in mm making the widest global label exactly half the atlas's ML length, shared by
 * both guide sets.
 * @param mlLength Atlas ML extent in mm.
 * @param fontAsset Font asset the labels are measured with.
 * @param globalTexts Resolved global label texts, used to find the widest.
 */
function axisGuideFontSize(
  mlLength: number,
  fontAsset: FontAsset,
  globalTexts: string[]
): number {
  const widest = Math.max(
    ...globalTexts.map(text => labelSizeEm(text, fontAsset).width)
  );
  return (mlLength * AXIS_GUIDE_WIDTH_ML_FRACTION) / widest;
}

/**
 * Width and height of a label in em, from the same layout engine that
 * renders it.
 * @param text Label text to measure.
 * @param fontAsset Font asset the label is laid out with.
 */
export function labelSizeEm(
  text: string,
  fontAsset: FontAsset
): { width: number; height: number } {
  const paragraph = new SdfTextParagraph(text, fontAsset);
  return {
    width: paragraph.width * fontAsset.scale,
    height: paragraph.height * fontAsset.scale
  };
}
