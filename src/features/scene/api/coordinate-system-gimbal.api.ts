import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
  type Scene,
  type SelectionOutlineLayer
} from "@babylonjs/core";
import {
  type CoordinateSystem,
  getCoordinateSystemAxisValue
} from "@/features/coordinate-system";
import type { ProbeContour } from "@/features/probe";
import { asrToVector3 } from "./coordinate-transforms.api";
import { buildAtlasRootNode } from "./structures.api";
import {
  buildHeadStageMesh,
  buildShankMesh,
  isSameProbeGeometry
} from "./probe.api";
import type { ProbeGeometry } from "../models/probe-geometry.model";

/** Name of the node the whole chain visualization hangs off. */
const GIMBAL_ROOT_NODE_NAME = "coordinateSystemGimbalRoot_node";
/** Prefix of a chain node's gimbal node and its own meshes; the segment after it is the chain index. */
const GIMBAL_NAME_PREFIX = "coordinateSystemGimbal_";
/** Prefix of a chain node's link arrow meshes; the segment after it is the chain index. */
const GIMBAL_LINK_NAME_PREFIX = "coordinateSystemGimbalLink_";
/** Name of the atlas-origin-to-reference-coordinate arrow's shaft. */
const GIMBAL_REFERENCE_MESH_NAME = "coordinateSystemGimbalReference_mesh";
/** Name of the probe-shank arrow's shaft, at the end of the chain. */
const GIMBAL_POSE_MESH_NAME = "coordinateSystemGimbalPose_mesh";
/** Suffix naming an arrow's cone head; the shaft carries the bare arrow name. */
const GIMBAL_ARROW_HEAD_SUFFIX = "_head";

/** Gimbal axis length, as a fraction of the atlas's longest dimension. */
const GIMBAL_AXIS_LENGTH_FRACTION = 0.18;
/** Origin sphere diameter, as a fraction of the gimbal axis length. */
const GIMBAL_ORIGIN_DIAMETER_FRACTION = 0.3;
/** Axis cylinder diameter, as a fraction of the gimbal axis length. */
const GIMBAL_AXIS_DIAMETER_FRACTION = 0.18;
/** Arrow shaft diameter, as a fraction of the gimbal axis length. */
const GIMBAL_ARROW_SHAFT_DIAMETER_FRACTION = 0.05;
/** Arrow cone head base diameter, as a fraction of the gimbal axis length. */
const GIMBAL_ARROW_HEAD_DIAMETER_FRACTION = 0.18;
/** Arrow cone head length, as a fraction of the gimbal axis length. */
const GIMBAL_ARROW_HEAD_LENGTH_FRACTION = 0.35;
/** Radial segments of every gimbal cylinder and cone. */
const GIMBAL_TESSELLATION = 8;

/** Suffix of each gimbal's three axis cylinder meshes, indexed by Babylon axis. */
const GIMBAL_AXIS_MESH_SUFFIXES: [string, string, string] = [
  "axisX",
  "axisY",
  "axisZ"
];
/** Local direction of each gimbal's three axis cylinders: Babylon X, Y, and +Z. */
export const GIMBAL_AXIS_DIRECTIONS: [Vector3, Vector3, Vector3] = [
  Vector3.Right(),
  Vector3.Up(),
  new Vector3(0, 0, 1)
];
/** Axis colours, indexed by Babylon axis: X red, Y green, Z blue — Quasar's `red`/`green`/`blue`, matching the inspector's axis toggles. */
export const GIMBAL_AXIS_COLORS: [Color3, Color3, Color3] = [
  Color3.FromHexString("#f44336"),
  Color3.FromHexString("#4caf50"),
  Color3.FromHexString("#2196f3")
];
/** Names of the three axis cylinder materials, indexed by Babylon axis. */
const GIMBAL_AXIS_MATERIAL_NAMES: [string, string, string] = [
  "coordinateSystemGimbalAxisX_material",
  "coordinateSystemGimbalAxisY_material",
  "coordinateSystemGimbalAxisZ_material"
];
/** Colour of the origin spheres and the chain link arrows. */
const GIMBAL_NEUTRAL_COLOR = Color3.White();
/** Name of the shared origin-sphere and chain-link material. */
const GIMBAL_NEUTRAL_MATERIAL_NAME = "coordinateSystemGimbalNeutral_material";
/** Colour of the reference-coordinate arrow: Quasar's `amber`. */
const GIMBAL_REFERENCE_COLOR = Color3.FromHexString("#ffc107");
/** Name of the reference-coordinate arrow's material. */
const GIMBAL_REFERENCE_MATERIAL_NAME =
  "coordinateSystemGimbalReference_material";
/** Colour of the probe-shank arrow: Quasar's `pink`. */
const GIMBAL_POSE_COLOR = Color3.FromHexString("#e91e63");
/** Name of the probe-shank arrow's material. */
const GIMBAL_POSE_MATERIAL_NAME = "coordinateSystemGimbalPose_material";
/** Name of the probe marker's head stage cone, at the end of the chain. */
const GIMBAL_POSE_HEAD_STAGE_MESH_NAME =
  "coordinateSystemGimbalPoseHeadStage_mesh";

/**
 * imec NP1000 planar contour in probe-local mm, tip on the origin and body up +y: the
 * probeinterface `neuropixels/NP1000` `probe_planar_contour`, scaled and recentred the way
 * `getProbeContour` does. Inlined rather than read from the probe library so the marker is the
 * same reference probe regardless of what the user has installed.
 */
const GIMBAL_POSE_CONTOUR: ProbeContour = {
  points: [
    { x: -0.035, y: 10.209 },
    { x: -0.035, y: 0.209 },
    { x: 0, y: 0 },
    { x: 0.035, y: 0.209 },
    { x: 0.035, y: 10.209 }
  ],
  widthMillimeters: 0.07,
  heightMillimeters: 10.209,
  origin: { x: 0, y: 0 }
};
/** Name of the cached, never-rendered head stage the per-sync marker clones come from. */
const GIMBAL_POSE_HEAD_STAGE_TEMPLATE_MESH_NAME =
  "coordinateSystemGimbalPoseHeadStageTemplate_mesh";

/**
 * Rebuild the selected coordinate system's chain gimbals and outline its focused node, or strip
 * the visualization when no coordinate system is selected.
 * @param scene Scene to build the gimbals in.
 * @param selectionOutlineLayer Selection outline layer the focused node's gimbal is added to.
 * @param coordinateSystem Coordinate system to visualize, or null to strip the visualization.
 * @param referenceCoordinateMillimeters Experiment reference coordinate, in atlas ASR mm.
 * @param atlasScaleMillimeters Atlas's longest dimension in mm, sizing every gimbal part.
 * @param focusedNodeIndex Chain index whose gimbal is outlined, or null for none.
 * @param probeGeometry Probe body geometry the chain-tip probe marker is sized from.
 */
export function syncCoordinateSystemGimbals(
  scene: Scene,
  selectionOutlineLayer: SelectionOutlineLayer,
  coordinateSystem: CoordinateSystem | null,
  referenceCoordinateMillimeters: [number, number, number],
  atlasScaleMillimeters: number,
  focusedNodeIndex: number | null,
  probeGeometry: ProbeGeometry
): void {
  const existingRoot = scene.getTransformNodeByName(GIMBAL_ROOT_NODE_NAME);

  if (!coordinateSystem) {
    existingRoot?.dispose();
    scene.getMeshByName(GIMBAL_POSE_HEAD_STAGE_TEMPLATE_MESH_NAME)?.dispose();
    return;
  }

  // Clearing before disposing keeps the outline layer from holding disposed meshes.
  selectionOutlineLayer.clearSelection();
  existingRoot?.dispose();

  const root = new TransformNode(GIMBAL_ROOT_NODE_NAME, scene);
  root.parent = buildAtlasRootNode(scene);
  const axisLength = getCoordinateSystemGimbalAxisLength(atlasScaleMillimeters);

  if (coordinateSystem.offsetByReferenceCoordinate) {
    root.position = asrToVector3(referenceCoordinateMillimeters);
    buildGimbalArrow(
      scene,
      root,
      GIMBAL_REFERENCE_MESH_NAME,
      root.position.negate(),
      Vector3.Zero(),
      axisLength,
      buildGimbalMaterial(
        scene,
        GIMBAL_REFERENCE_MATERIAL_NAME,
        GIMBAL_REFERENCE_COLOR
      )
    );
  } else {
    root.position = Vector3.Zero();
  }

  const neutralMaterial = buildGimbalMaterial(
    scene,
    GIMBAL_NEUTRAL_MATERIAL_NAME,
    GIMBAL_NEUTRAL_COLOR
  );
  const axisMaterials = GIMBAL_AXIS_MATERIAL_NAMES.map((name, index) =>
    buildGimbalMaterial(scene, name, GIMBAL_AXIS_COLORS[index]!)
  );

  let parent: TransformNode = root;
  for (const [index, node] of coordinateSystem.chain.entries()) {
    const position = new Vector3(
      getCoordinateSystemAxisValue(node, "position", 0),
      getCoordinateSystemAxisValue(node, "position", 1),
      getCoordinateSystemAxisValue(node, "position", 2)
    );
    const rotation = new Vector3(
      getCoordinateSystemAxisValue(node, "rotation", 0),
      getCoordinateSystemAxisValue(node, "rotation", 1),
      getCoordinateSystemAxisValue(node, "rotation", 2)
    );

    // The chain's translation is expressed in the parent's frame, so this
    // segment is straight in `parent`'s local space.
    if (position.lengthSquared() > 0) {
      buildGimbalArrow(
        scene,
        parent,
        `${GIMBAL_LINK_NAME_PREFIX}${index}_mesh`,
        Vector3.Zero(),
        position,
        axisLength,
        neutralMaterial
      );
    }

    const gimbal = new TransformNode(
      `${GIMBAL_NAME_PREFIX}${index}_node`,
      scene
    );
    gimbal.parent = parent;
    gimbal.position = position;
    gimbal.rotation = rotation;

    const origin = MeshBuilder.CreateSphere(
      `${GIMBAL_NAME_PREFIX}${index}_origin_mesh`,
      {
        diameter: axisLength * GIMBAL_ORIGIN_DIAMETER_FRACTION,
        segments: GIMBAL_TESSELLATION
      },
      scene
    );
    origin.parent = gimbal;
    origin.material = neutralMaterial;

    // Only the positive half of each axis is drawn, so the local orientation
    // is unambiguous.
    for (const [axis, direction] of GIMBAL_AXIS_DIRECTIONS.entries()) {
      const cylinder = MeshBuilder.CreateCylinder(
        `${GIMBAL_NAME_PREFIX}${index}_${GIMBAL_AXIS_MESH_SUFFIXES[axis]}_mesh`,
        {
          diameter: axisLength * GIMBAL_AXIS_DIAMETER_FRACTION,
          height: axisLength,
          tessellation: GIMBAL_TESSELLATION
        },
        scene
      );
      cylinder.parent = gimbal;
      cylinder.material = axisMaterials[axis]!;
      cylinder.position = direction.scale(axisLength / 2);
      cylinder.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
        Vector3.Up(),
        direction,
        new Quaternion()
      );
    }

    parent = gimbal;
  }

  // Lands on the last gimbal, or on `root` for an empty chain.
  buildGimbalPoseProbe(
    scene,
    parent,
    probeGeometry,
    buildGimbalPoseMaterial(scene)
  );

  if (focusedNodeIndex !== null) {
    const focusedGimbalNamePrefix = `${GIMBAL_NAME_PREFIX}${focusedNodeIndex}_`;
    const focusedGimbal = scene.getTransformNodeByName(
      `${focusedGimbalNamePrefix}node`
    );
    if (focusedGimbal) {
      // Excludes the next node's link arrow, which is parented to this
      // gimbal but named with `GIMBAL_LINK_NAME_PREFIX`.
      selectionOutlineLayer.addSelection(
        focusedGimbal.getChildMeshes(true, mesh =>
          mesh.name.startsWith(focusedGimbalNamePrefix)
        )
      );
    }
  }
}

/**
 * A chain node's gimbal node, or null when that node is not currently drawn.
 * @param scene Scene the gimbals were built in.
 * @param nodeIndex Chain index of the node.
 */
export function getCoordinateSystemGimbalNode(
  scene: Scene,
  nodeIndex: number
): TransformNode | null {
  return scene.getTransformNodeByName(`${GIMBAL_NAME_PREFIX}${nodeIndex}_node`);
}

/**
 * Length each gimbal's axis cylinders span, in mm — the distance labels sit just beyond.
 * @param atlasScaleMillimeters Atlas longest dimension in mm.
 */
export function getCoordinateSystemGimbalAxisLength(
  atlasScaleMillimeters: number
): number {
  return atlasScaleMillimeters * GIMBAL_AXIS_LENGTH_FRACTION;
}

/**
 * Build one emissive arrow — a shaft cylinder plus a cone head — spanning two points in the
 * parent's local space, skipping it entirely when the span is degenerate.
 * @param scene Scene to build the meshes in.
 * @param parent Node the arrow meshes are parented to.
 * @param name Name of the shaft mesh; the head appends `GIMBAL_ARROW_HEAD_SUFFIX`.
 * @param from Arrow tail, in the parent's local space.
 * @param to Arrow tip, in the parent's local space.
 * @param axisLength Gimbal axis length the arrow's thickness is derived from.
 * @param material Emissive material shared by the shaft and head.
 */
function buildGimbalArrow(
  scene: Scene,
  parent: TransformNode,
  name: string,
  from: Vector3,
  to: Vector3,
  axisLength: number,
  material: StandardMaterial
): void {
  const span = to.subtract(from);
  const length = span.length();
  if (length === 0) return;

  const direction = span.normalize();
  const shaftOrientation = Quaternion.FromUnitVectorsToRef(
    Vector3.Up(),
    direction,
    new Quaternion()
  );
  // A link shorter than the nominal head never gets a head longer than half the link.
  const headLength = Math.min(
    axisLength * GIMBAL_ARROW_HEAD_LENGTH_FRACTION,
    length * 0.5
  );
  const shaftLength = length - headLength;

  if (shaftLength > 0) {
    const shaft = MeshBuilder.CreateCylinder(
      name,
      {
        diameter: axisLength * GIMBAL_ARROW_SHAFT_DIAMETER_FRACTION,
        height: shaftLength,
        tessellation: GIMBAL_TESSELLATION
      },
      scene
    );
    shaft.parent = parent;
    shaft.material = material;
    shaft.position = from.add(direction.scale(shaftLength / 2));
    shaft.rotationQuaternion = shaftOrientation;
  }

  const head = MeshBuilder.CreateCylinder(
    `${name}${GIMBAL_ARROW_HEAD_SUFFIX}`,
    {
      diameterTop: 0,
      diameterBottom: axisLength * GIMBAL_ARROW_HEAD_DIAMETER_FRACTION,
      height: headLength,
      tessellation: GIMBAL_TESSELLATION
    },
    scene
  );
  head.parent = parent;
  head.material = material;
  head.position = from.add(direction.scale(length - headLength / 2));
  head.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
    Vector3.Up(),
    direction,
    new Quaternion()
  );
}

/**
 * Build the chain-tip probe marker: an NP1000 shank extruded from its planar contour plus the
 * head stage cone above it, tip on the parent's origin and body along its local +Z.
 * @param scene Scene to build the meshes in.
 * @param parent Node the marker's meshes are parented to.
 * @param geometry Probe body geometry the shank thickness and head stage are sized from.
 * @param material Lit material shared by the shank and the head stage.
 */
function buildGimbalPoseProbe(
  scene: Scene,
  parent: TransformNode,
  geometry: ProbeGeometry,
  material: StandardMaterial
): void {
  const shank = buildShankMesh(
    scene,
    GIMBAL_POSE_CONTOUR,
    GIMBAL_POSE_MESH_NAME,
    geometry
  );
  shank.parent = parent;
  shank.material = material;

  // Cloned, not rebuilt: the notch is a CSG2 subtract and this runs on every value edit.
  const headStage = buildGimbalPoseHeadStageTemplate(scene, geometry).clone(
    GIMBAL_POSE_HEAD_STAGE_MESH_NAME,
    parent
  );
  headStage.setEnabled(true);
  headStage.material = material;
}

/** Metadata on the cached head-stage template: the geometry its notch was cut for. */
interface GimbalPoseTemplateMetadata {
  geometry: ProbeGeometry;
}

/**
 * Get or re-cut the never-rendered head stage the chain-tip marker clones, so the CSG2 notch
 * costs one boolean per geometry instead of one per value edit.
 * @param scene Scene to cache the template in.
 * @param geometry Probe body geometry the head stage is sized from.
 */
function buildGimbalPoseHeadStageTemplate(
  scene: Scene,
  geometry: ProbeGeometry
): Mesh {
  const existing = scene.getMeshByName(
    GIMBAL_POSE_HEAD_STAGE_TEMPLATE_MESH_NAME
  );
  // Only this function ever writes a mesh under that name, so its metadata is ours.
  const cached = existing?.metadata as GimbalPoseTemplateMetadata | undefined;
  if (
    existing instanceof Mesh &&
    cached &&
    isSameProbeGeometry(cached.geometry, geometry)
  ) {
    return existing;
  }
  existing?.dispose();

  const template = buildHeadStageMesh(
    scene,
    GIMBAL_POSE_CONTOUR,
    GIMBAL_POSE_HEAD_STAGE_TEMPLATE_MESH_NAME,
    geometry
  );
  template.metadata = { geometry } satisfies GimbalPoseTemplateMetadata;
  template.setEnabled(false);
  return template;
}

/**
 * Get or build one of the gimbal's shared unlit emissive materials.
 * @param scene Scene to get the material from.
 * @param name Material name, unique per colour.
 * @param color Emissive colour the material renders.
 */
function buildGimbalMaterial(
  scene: Scene,
  name: string,
  color: Color3
): StandardMaterial {
  const existing = scene.getMaterialByName(name);
  if (existing instanceof StandardMaterial) return existing;

  const material = new StandardMaterial(name, scene);
  material.emissiveColor = color;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  return material;
}

/**
 * Get or build the chain-tip marker's lit material, shaded so the head stage's notch reads as a
 * cut surface instead of a flat silhouette.
 * @param scene Scene to get the material from.
 */
function buildGimbalPoseMaterial(scene: Scene): StandardMaterial {
  const existing = scene.getMaterialByName(GIMBAL_POSE_MATERIAL_NAME);
  if (existing instanceof StandardMaterial) return existing;

  const material = new StandardMaterial(GIMBAL_POSE_MATERIAL_NAME, scene);
  material.diffuseColor = GIMBAL_POSE_COLOR;
  return material;
}
