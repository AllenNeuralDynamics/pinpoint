import {
  Color3,
  MeshBuilder,
  PointerEventTypes,
  StandardMaterial,
  type Observer,
  type PointerInfo,
  type Scene,
  type TransformNode
} from "@babylonjs/core";
import type { ProbeSurfaceChoice } from "@/features/probe";
import { asrToVector3 } from "./coordinate-transforms.api";
import { buildAtlasRootNode } from "./structures.api";

/** Which surface-move path a path mesh represents. */
export type ProbeSurfacePathKind = "axis" | "dorsoventral";

/** Prefix of a surface-path mesh's name; the suffix is its `ProbeSurfacePathKind`. */
const PROBE_SURFACE_PATH_MESH_PREFIX = "probeSurfacePath_";

/** Suffix applied to a surface-path mesh's name to name its material. */
const PROBE_SURFACE_PATH_MATERIAL_SUFFIX = "_material";

/** Diameter of a surface-path tube, in mm. */
const PROBE_SURFACE_PATH_DIAMETER_MILLIMETERS = 0.2;

/** Radial segments of a surface-path tube. */
const PROBE_SURFACE_PATH_TESSELLATION = 8;

/** Emissive color of the along-axis path: blue, from STANDARD_COLORS. */
const AXIS_PATH_COLOR = Color3.FromHexString("#2196f3");

/** Emissive color of the down-on-DV path: green, from STANDARD_COLORS. */
const DORSOVENTRAL_PATH_COLOR = Color3.FromHexString("#4caf50");

/** Build the two surface-path tubes for a pending choice, replacing any existing pair. */
export function buildProbeSurfacePaths(
  scene: Scene,
  choice: ProbeSurfaceChoice
): void {
  disposeProbeSurfacePaths(scene);

  const atlasRoot = buildAtlasRootNode(scene);
  buildSurfacePathTube(
    scene,
    atlasRoot,
    "axis",
    choice.tipMillimeters,
    choice.axisTargetMillimeters,
    AXIS_PATH_COLOR
  );
  buildSurfacePathTube(
    scene,
    atlasRoot,
    "dorsoventral",
    choice.tipMillimeters,
    choice.dorsoventralTargetMillimeters,
    DORSOVENTRAL_PATH_COLOR
  );
}

/** Dispose the surface-path tubes and their materials, if present. */
export function disposeProbeSurfacePaths(scene: Scene): void {
  disposeSurfacePathTube(scene, "axis");
  disposeSurfacePathTube(scene, "dorsoventral");
}

/** The path kind a Babylon entity name marks, or null when it isn't a path mesh. */
export function getProbeSurfacePathKind(
  name: string | null | undefined
): ProbeSurfacePathKind | null {
  if (name === `${PROBE_SURFACE_PATH_MESH_PREFIX}axis`) return "axis";
  if (name === `${PROBE_SURFACE_PATH_MESH_PREFIX}dorsoventral`) {
    return "dorsoventral";
  }
  return null;
}

/** Apply the user's pick when a surface-path tube is tapped. */
export function pickProbeSurfacePathOnTap(
  scene: Scene,
  onPick: (kind: ProbeSurfacePathKind) => void
): Observer<PointerInfo> {
  return scene.onPointerObservable.add(() => {
    const { pickedMesh } = scene.pick(scene.pointerX, scene.pointerY, mesh =>
      mesh.name.startsWith(PROBE_SURFACE_PATH_MESH_PREFIX)
    );
    const kind = getProbeSurfacePathKind(pickedMesh?.name);
    if (kind) onPick(kind);
  }, PointerEventTypes.POINTERTAP);
}

/**
 * Build one surface-path tube and its emissive material, parented under the atlas root.
 * @param scene Scene to build the tube in.
 * @param parent Node to parent the tube under.
 * @param kind Path kind the tube represents, naming its mesh and material.
 * @param tipMillimeters Tube start, in atlas ASR mm.
 * @param targetMillimeters Tube end, in atlas ASR mm.
 * @param color Emissive color of the tube's material.
 */
function buildSurfacePathTube(
  scene: Scene,
  parent: TransformNode,
  kind: ProbeSurfacePathKind,
  tipMillimeters: [number, number, number],
  targetMillimeters: [number, number, number],
  color: Color3
): void {
  const name = `${PROBE_SURFACE_PATH_MESH_PREFIX}${kind}`;
  const tube = MeshBuilder.CreateTube(
    name,
    {
      path: [asrToVector3(tipMillimeters), asrToVector3(targetMillimeters)],
      radius: PROBE_SURFACE_PATH_DIAMETER_MILLIMETERS / 2,
      tessellation: PROBE_SURFACE_PATH_TESSELLATION
    },
    scene
  );
  tube.parent = parent;

  const material = new StandardMaterial(
    `${name}${PROBE_SURFACE_PATH_MATERIAL_SUFFIX}`,
    scene
  );
  material.emissiveColor = color;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  tube.material = material;
}

/**
 * Dispose one surface-path tube's mesh and material, if present.
 * @param scene Scene holding the tube.
 * @param kind Path kind naming the tube's mesh and material.
 */
function disposeSurfacePathTube(
  scene: Scene,
  kind: ProbeSurfacePathKind
): void {
  const name = `${PROBE_SURFACE_PATH_MESH_PREFIX}${kind}`;
  scene.getMeshByName(name)?.dispose();
  scene
    .getMaterialByName(`${name}${PROBE_SURFACE_PATH_MATERIAL_SUFFIX}`)
    ?.dispose();
}
