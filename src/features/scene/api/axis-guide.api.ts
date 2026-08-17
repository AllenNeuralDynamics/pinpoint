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
import type {
  AnatomicalDirection,
  AnatomicalLine,
  AxisDirections
} from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  CANONICAL_AXIS_DIRECTIONS,
  getDirectionLine,
  getDirectionVector,
  getLineAxisIndex
} from "@/utils/coordinate-frame";
import { toWorldVector } from "./coordinate-transforms.api";
import {
  GLOBAL_FRAME_AXIS_COLORS,
  LOCAL_FRAME_AXIS_COLORS
} from "./frame-axes.api";
import type { FrameAxes } from "../models/frame-axis.model";

/** Axis names a global guide set is labelled with, and the axes a local set marks. */
export interface AxisGuideLabels {
  /** Name of each of the global coordinate system's axes, indexed by axis. */
  global: [string, string, string];
  /**
   * Axes a local guide set marks, in the tracked node's own space. Only their
   * directions and names are read: a local guide's colour comes from
   * `LOCAL_FRAME_AXIS_COLORS`, indexed as the frame orders its axes, since a
   * text renderer is coloured once when it is created.
   */
  local: FrameAxes;
}

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
  renderers: Record<AxisGuidePaletteKey, AxisGuideTextRenderer>;
  fontAsset: FontAsset;
  /** Release the renderers, the font asset, and the per-frame draw hook. */
  dispose: () => void;
}

/**
 * Frame the axis guides are drawn in: the global coordinate system's axes, or
 * the Babylon axes of the node the getter resolves.
 */
export type AxisGuideFrame =
  | { kind: "global" }
  | { kind: "local"; getNode: () => TransformNode | null };

/** Euler rotation in radians, in Babylon's yaw-pitch-roll order. */
interface AxisGuideRotation {
  pitch: number;
  yaw: number;
  roll: number;
}

/** A guide's label orientation for each end of the axis it lies along. */
interface AxisGuideRotationPair {
  positive: AxisGuideRotation;
  negative: AxisGuideRotation;
}

/** One axis guide: what colours it, where it sits, its label, and its orientation. */
interface AxisGuideSpec {
  /** Palette entry keying the guide's text renderer, colour and arrow material. */
  paletteKey: AxisGuidePaletteKey;
  /** Unit direction, in the guide root's space, the guide sits along. */
  direction: Vector3;
  /** Label text drawn on the guide: its sign followed by its axis's name. */
  text: string;
  /** Distance from the origin the guide's arrow tip sits at, in mm. */
  anchor: number;
  /** Mesh name segment: the axis index and sign, so renaming an axis keeps the names. */
  key: string;
  /** Orientation the guide's label and pick quad are drawn at. */
  rotation: AxisGuideRotation;
}

const AXIS_GUIDE_ROOT_NODE_NAME = "axisGuideRoot_node";

/** Babylon's Roboto MSDF font definition and its glyph atlas. */
const AXIS_GUIDE_FONT_DEFINITION_URL =
  "https://assets.babylonjs.com/fonts/roboto-regular.json";
const AXIS_GUIDE_FONT_TEXTURE_URL =
  "https://assets.babylonjs.com/fonts/roboto-regular.png";

/** The two ends every axis is guided at, in the order their guides are built. */
const AXIS_GUIDE_SIGNS: ["+", "-"] = ["+", "-"];

/**
 * Which palette entry a guide is drawn in: the anatomical line it runs along
 * for a global set, so a colour marks an anatomical plane rather than a
 * coordinate system's axis order, or its own frame axis for a local set.
 */
export type AxisGuidePaletteKey =
  | AnatomicalLine
  | "localAxis0"
  | "localAxis1"
  | "localAxis2";

/** Palette key of each global guide: the anatomical line its axis runs along. */
const AXIS_GUIDE_LINE_KEYS: [
  AxisGuidePaletteKey,
  AxisGuidePaletteKey,
  AxisGuidePaletteKey
] = ["leftRight", "inferiorSuperior", "posteriorAnterior"];

/** Palette key of each local guide, indexed as its frame orders its axes. */
const AXIS_GUIDE_LOCAL_KEYS: [
  AxisGuidePaletteKey,
  AxisGuidePaletteKey,
  AxisGuidePaletteKey
] = ["localAxis0", "localAxis1", "localAxis2"];

/** Every palette key, in the order the renderers are created. */
const AXIS_GUIDE_PALETTE_KEYS: AxisGuidePaletteKey[] = [
  ...AXIS_GUIDE_LINE_KEYS,
  ...AXIS_GUIDE_LOCAL_KEYS
];

/**
 * Label orientation per Babylon world axis. MSDF text is legible from its local
 * -Z side, with local +X its reading direction and local +Y its top edge: a
 * quarter-turn pitch lays the guides along world X and Z flat in the world X/Z
 * plane facing world +Y, where yaw turns each label's top edge towards its own
 * signed axis; the guides along world Y stay upright in the world X/Y plane,
 * facing world -Z with their top edge already towards world +Y.
 */
const AXIS_GUIDE_WORLD_ROTATIONS: [
  AxisGuideRotationPair,
  AxisGuideRotationPair,
  AxisGuideRotationPair
] = [
  {
    positive: { pitch: Math.PI / 2, yaw: Math.PI / 2, roll: 0 },
    negative: { pitch: Math.PI / 2, yaw: -Math.PI / 2, roll: 0 }
  },
  {
    positive: { pitch: 0, yaw: 0, roll: 0 },
    negative: { pitch: 0, yaw: 0, roll: 0 }
  },
  {
    positive: { pitch: Math.PI / 2, yaw: 0, roll: 0 },
    negative: { pitch: Math.PI / 2, yaw: Math.PI, roll: 0 }
  }
];

/**
 * Label orientation per Babylon axis of the tracked node, drawn as the global
 * convention with +Z as the up axis: the guides along local X and Y lie flat in
 * the local X/Y plane facing +Z with each top edge radiating outward along its
 * own signed axis; those along local Z stand upright in the local Z/X plane
 * facing +Y with both top edges toward +Z. A local frame's axis is looked up
 * here by the node axis it runs along, whatever the frame calls it.
 */
const AXIS_GUIDE_LOCAL_ROTATIONS: [
  AxisGuideRotationPair,
  AxisGuideRotationPair,
  AxisGuideRotationPair
] = [
  {
    positive: { pitch: Math.PI, yaw: 0, roll: -Math.PI / 2 },
    negative: { pitch: Math.PI, yaw: 0, roll: Math.PI / 2 }
  },
  {
    positive: { pitch: 0, yaw: Math.PI, roll: 0 },
    negative: { pitch: Math.PI, yaw: 0, roll: 0 }
  },
  {
    positive: { pitch: Math.PI / 2, yaw: 0, roll: 0 },
    negative: { pitch: Math.PI / 2, yaw: 0, roll: 0 }
  }
];

/** Widest global label's width, as a fraction of the atlas's left-right length. */
const AXIS_GUIDE_WIDTH_LEFT_RIGHT_FRACTION = 0.5;

const AXIS_GUIDE_PICK_MESH_NAME_PREFIX = "axisGuidePick_";

/** Prefix of an axis guide arrow's mesh and material names. */
const AXIS_GUIDE_ARROW_MESH_NAME_PREFIX = "axisGuideArrow_";
/** Suffix naming an arrow's cone head; the shaft carries the bare guide name. */
const AXIS_GUIDE_ARROW_HEAD_SUFFIX = "_head";
/** Suffix applied to a line's arrow material name. */
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
 * Load the MSDF font and create one text renderer per anatomical line, drawn
 * after every frame of the scene. Rejects, leaving nothing behind, if the font
 * definition cannot be fetched or the renderers cannot be created.
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

  let renderers: Record<AxisGuidePaletteKey, TextRenderer>;
  try {
    const created = await Promise.all(
      AXIS_GUIDE_PALETTE_KEYS.map(
        async key =>
          [
            key,
            await createTextRenderer(
              engine,
              fontAsset,
              axisGuideColor(key).toColor4()
            )
          ] as const
      )
    );
    renderers = Object.fromEntries(created) as Record<
      AxisGuidePaletteKey,
      TextRenderer
    >;
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
 * Rebuild the six axis guide labels, their arrows, and their pick meshes,
 * replacing any existing ones.
 * @param scene Scene holding the axis guide root node.
 * @param guides Text renderers and font asset to draw the labels with.
 * @param atlas Atlas supplying the atlas's dimensions.
 * @param globalDirections Axis directions of the experiment's global coordinate system.
 * @param frame Frame to draw the guides in: the global coordinate system's axes, or a node's Babylon axes.
 * @param labels Label text per axis, from the coordinate system's axis names.
 */
export function buildAxisGuides(
  scene: Scene,
  guides: AxisGuides,
  atlas: Atlas,
  globalDirections: AxisDirections,
  frame: AxisGuideFrame,
  labels: AxisGuideLabels
): void {
  clearAxisGuides(scene, guides);

  const leftRightLength = atlasLineExtent(atlas, "leftRight");
  if (leftRightLength === 0) return;

  // Built for either frame: the local set borrows the global labels' em size,
  // so both sets read at the same scale.
  const globalSpecs = buildGlobalAxisGuideSpecs(
    atlas,
    globalDirections,
    labels.global
  );
  const specs =
    frame.kind === "local"
      ? buildLocalAxisGuideSpecs(atlas, labels.local)
      : globalSpecs;

  // `setAtlasCenterOffset` keeps the atlas center on the scene origin, so the
  // guides are placed straight in world space around that origin.
  const root = new TransformNode(AXIS_GUIDE_ROOT_NODE_NAME, scene);
  const fontSize = axisGuideFontSize(
    leftRightLength,
    guides.fontAsset,
    globalSpecs.map(spec => spec.text)
  );
  const materials = buildAxisGuideArrowMaterials(
    scene,
    frame.kind === "local" ? AXIS_GUIDE_LOCAL_KEYS : AXIS_GUIDE_LINE_KEYS
  );
  if (frame.kind === "local")
    trackAxisGuideLocalFrame(scene, root, frame.getNode);

  for (const spec of specs) {
    const labelSize = labelSizeEm(spec.text, guides.fontAsset);
    const labelCenter = spec.direction.scale(
      spec.anchor +
        (AXIS_GUIDE_ARROW_LABEL_GAP_EM + labelSize.height / 2) * fontSize
    );

    const renderer = guides.renderers[spec.paletteKey];
    renderer.parent = root;
    renderer.addParagraph(
      spec.text,
      undefined,
      axisGuideMatrix(spec, labelCenter, fontSize)
    );
    buildAxisGuidePickMesh(scene, root, spec, labelCenter, fontSize, labelSize);
    buildAxisGuideArrow(
      scene,
      root,
      spec,
      fontSize,
      materials[spec.paletteKey]!
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
  for (const key of AXIS_GUIDE_PALETTE_KEYS) {
    scene
      .getMaterialByName(
        `${AXIS_GUIDE_ARROW_MESH_NAME_PREFIX}${key}${AXIS_GUIDE_ARROW_MATERIAL_SUFFIX}`
      )
      ?.dispose();
  }
  for (const renderer of Object.values(guides.renderers)) {
    renderer.clearParagraphs();
    renderer.parent = null;
  }
}

/**
 * The six guides along a global coordinate system's axes: each axis's two ends,
 * pointing along the Babylon world directions its anatomical axis runs.
 * @param atlas Atlas whose extents anchor each guide.
 * @param directions Axis directions of the global coordinate system.
 * @param names Name of each of its axes, indexed by axis.
 */
function buildGlobalAxisGuideSpecs(
  atlas: Atlas,
  directions: AxisDirections,
  names: [string, string, string]
): AxisGuideSpec[] {
  return directions.flatMap((direction, axis) => {
    const line = getDirectionLine(direction);
    const anchor = atlasLineExtent(atlas, line);
    const positive = worldAxisDirection(atlas, direction);
    return AXIS_GUIDE_SIGNS.map(sign => {
      const signed = sign === "+" ? positive : positive.negate();
      return {
        paletteKey: line,
        direction: signed,
        text: `${sign}${names[axis]!}`,
        anchor,
        key: `${axis}${sign}`,
        rotation: axisGuideRotation(signed, AXIS_GUIDE_WORLD_ROTATIONS)
      };
    });
  });
}

/**
 * The six guides along a local frame's own axes, every one anchored at the
 * atlas's longest extent: an axis-specific anchor, as the global set uses, can
 * land inside the atlas once the frame rotates.
 * @param atlas Atlas whose longest extent anchors every guide.
 * @param axes Axes the frame marks, in the tracked node's own space.
 */
function buildLocalAxisGuideSpecs(
  atlas: Atlas,
  axes: FrameAxes
): AxisGuideSpec[] {
  const anchor = Math.max(...getAtlasDimensionsMillimeters(atlas));
  return axes.flatMap((axis, index) =>
    AXIS_GUIDE_SIGNS.map(sign => {
      const signed =
        sign === "+" ? axis.direction.clone() : axis.direction.negate();
      return {
        paletteKey: AXIS_GUIDE_LOCAL_KEYS[index]!,
        direction: signed,
        text: `${sign}${axis.label}`,
        anchor,
        key: `${index}${sign}`,
        rotation: axisGuideRotation(signed, AXIS_GUIDE_LOCAL_ROTATIONS)
      };
    })
  );
}

/**
 * Atlas extent along an anatomical line, in mm, which the guides on that line
 * are anchored past.
 * @param atlas Atlas to measure.
 * @param line Anatomical line to measure along.
 */
function atlasLineExtent(atlas: Atlas, line: AnatomicalLine): number {
  return getAtlasDimensionsMillimeters(atlas)[
    getLineAxisIndex(ATLAS_AXIS_DIRECTIONS, line)
  ]!;
}

/**
 * Babylon world direction an anatomical direction points, taken from the
 * atlas-to-world conversion so no guide carries a world-space literal.
 * @param atlas Atlas whose center anchors world space.
 * @param direction Anatomical direction to convert.
 */
function worldAxisDirection(
  atlas: Atlas,
  direction: AnatomicalDirection
): Vector3 {
  const origin = toWorldVector(CANONICAL_AXIS_DIRECTIONS, atlas, [0, 0, 0]);
  return toWorldVector(
    CANONICAL_AXIS_DIRECTIONS,
    atlas,
    getDirectionVector(direction)
  ).subtractInPlace(origin);
}

/**
 * Label orientation for a guide lying along a direction, keyed to the axis it
 * runs along and its sign rather than to what the frame calls that axis.
 * @param direction Unit direction, in the guide root's space, the guide sits along.
 * @param rotations Orientation pair per axis of the space the direction is in.
 */
function axisGuideRotation(
  direction: Vector3,
  rotations: [
    AxisGuideRotationPair,
    AxisGuideRotationPair,
    AxisGuideRotationPair
  ]
): AxisGuideRotation {
  // Every guided direction is axis aligned, so exactly one component is +-1.
  const components: [number, number, number] = [
    direction.x,
    direction.y,
    direction.z
  ];
  const axis =
    Math.abs(components[0]) > 0.5 ? 0 : Math.abs(components[1]) > 0.5 ? 1 : 2;
  const pair = rotations[axis];
  return components[axis] > 0 ? pair.positive : pair.negative;
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
 * @param labelCenter Label's centre position, in the guide root's space.
 * @param fontSize Label em size in mm.
 * @param labelSize Label's measured width and height in em.
 */
function buildAxisGuidePickMesh(
  scene: Scene,
  root: TransformNode,
  spec: AxisGuideSpec,
  labelCenter: Vector3,
  fontSize: number,
  labelSize: { width: number; height: number }
): void {
  const { width, height } = labelSize;
  const mesh = MeshBuilder.CreatePlane(
    `${AXIS_GUIDE_PICK_MESH_NAME_PREFIX}${spec.key}`,
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
 * @param fontSize Label em size in mm.
 * @param material Emissive material shared with the line's other arrows.
 */
function buildAxisGuideArrow(
  scene: Scene,
  root: TransformNode,
  spec: AxisGuideSpec,
  fontSize: number,
  material: StandardMaterial
): void {
  const shaftName = `${AXIS_GUIDE_ARROW_MESH_NAME_PREFIX}${spec.key}`;

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
    spec.anchor -
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
    spec.anchor - (AXIS_GUIDE_ARROW_HEAD_LENGTH_EM / 2) * fontSize
  );
  head.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
    Vector3.Up(),
    spec.direction,
    new Quaternion()
  );
}

/**
 * Build one unlit emissive material per palette key the guides use, shared by
 * the two arrows on each axis.
 * @param scene Scene to create the materials in.
 * @param keys Palette keys to build a material for; a repeated key is built once.
 */
function buildAxisGuideArrowMaterials(
  scene: Scene,
  keys: [AxisGuidePaletteKey, AxisGuidePaletteKey, AxisGuidePaletteKey]
): Partial<Record<AxisGuidePaletteKey, StandardMaterial>> {
  return Object.fromEntries(
    keys.map(key => {
      const material = new StandardMaterial(
        `${AXIS_GUIDE_ARROW_MESH_NAME_PREFIX}${key}${AXIS_GUIDE_ARROW_MATERIAL_SUFFIX}`,
        scene
      );
      material.emissiveColor = axisGuideColor(key);
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.disableLighting = true;
      return [key, material];
    })
  );
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
 * Em size in mm making the widest global label exactly half the atlas's
 * left-right length, shared by both guide sets.
 * @param leftRightLength Atlas extent along the left-right line, in mm.
 * @param fontAsset Font asset the labels are measured with.
 * @param globalTexts Resolved global label texts, used to find the widest.
 */
function axisGuideFontSize(
  leftRightLength: number,
  fontAsset: FontAsset,
  globalTexts: string[]
): number {
  const widest = Math.max(
    ...globalTexts.map(text => labelSizeEm(text, fontAsset).width)
  );
  return (leftRightLength * AXIS_GUIDE_WIDTH_LEFT_RIGHT_FRACTION) / widest;
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

/**
 * Label and arrow colour of a palette key, taken from the frames the transform
 * gizmos are drawn along so a guide and the handle on the same axis are always
 * the same colour, and the two coordinate spaces never look alike. Read on
 * call, not at module scope, which would race the scene barrel's import cycle.
 * @param key Palette key to colour.
 */
function axisGuideColor(key: AxisGuidePaletteKey): Color3 {
  switch (key) {
    case "localAxis0":
      return LOCAL_FRAME_AXIS_COLORS[0];
    case "localAxis1":
      return LOCAL_FRAME_AXIS_COLORS[1];
    case "localAxis2":
      return LOCAL_FRAME_AXIS_COLORS[2];
    default:
      return GLOBAL_FRAME_AXIS_COLORS[key];
  }
}
