import type {
  AbstractMesh,
  DragEvent,
  DragStartEndEvent,
  GizmoManager,
  IGizmo,
  IPositionGizmo,
  IRotationGizmo,
  Nullable,
  Observer,
  PhysicsShape,
  Scene,
  SelectionOutlineLayer
} from "@babylonjs/core";
import {
  Color3,
  CSG2,
  ExtrudePolygon,
  Mesh,
  MeshBuilder,
  PhysicsShapeBox,
  PhysicsShapeConvexHull,
  StandardMaterial,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import earcut from "earcut";
import type { Experiment } from "@/features/experiment";
import { getInternedProbeInterfaceProbe } from "@/features/experiment";
import type { Probe, ProbeContour } from "@/features/probe";
import {
  getProbeAlignmentOffsetMillimeters,
  getProbeContour,
  getProbeInterfaceIdentifier,
  getProbeShanks
} from "@/features/probe";
import { setMaterialDiffuseColor } from "./material.api";
import { buildAtlasRootNode } from "./structures.api";
import { asrToVector3, vector3ToAsr } from "./coordinate-transforms.api";
import { buildCollisionBody, disposeCollisionBody } from "./collision.api";
import {
  buildSceneEntityName,
  isSceneEntityName,
  sceneEntityIdFromName,
  sceneEntityNameSuffix
} from "./scene-entity.api";
import {
  interpolateNodePose,
  stopNodePoseInterpolation
} from "./pose-interpolation.api";
import type { ProbeMetadata } from "../models/probe-metadata.model";
import type { ProbeGeometry } from "../models/probe-geometry.model";
import type { TransformGizmos } from "../models/gizmo.model";

/** Suffix applied to a probe's id to name its parenting transform node. */
const PROBE_NODE_SUFFIX = sceneEntityNameSuffix("probe", "node");

/** Suffix applied to a probe's id to name its shank mesh. */
const SHANK_MESH_SUFFIX = sceneEntityNameSuffix("probe", "shank_mesh");

/** Suffix applied to a probe's id to name its head stage mesh. */
const HEAD_STAGE_MESH_SUFFIX = sceneEntityNameSuffix(
  "probe",
  "head-stage_mesh"
);

/** Suffix applied to a probe's id to name its rod mesh. */
const ROD_MESH_SUFFIX = sceneEntityNameSuffix("probe", "rod_mesh");

/** Name of the shared gray material used by every probe's rod mesh. */
const ROD_MATERIAL_NAME = "probe_rod_material";

/**
 * Get a probe's transform node by ID.
 * @param scene Scene to search for probe.
 * @param probeId ID of the probe to get.
 */
export function getProbeTransformNode(
  scene: Scene,
  probeId: string
): TransformNode | null {
  return scene.getTransformNodeByName(
    buildSceneEntityName(probeId, "probe", "node")
  );
}

/**
 * A probe's shank, head stage, and rod meshes, or an empty list when the probe is not built.
 * @param scene Scene the probe was built in.
 * @param probeId Probe id whose meshes to get.
 */
export function getProbeMeshes(scene: Scene, probeId: string): Mesh[] {
  return (
    getProbeTransformNode(scene, probeId)
      ?.getChildMeshes(false)
      .filter((mesh): mesh is Mesh => mesh instanceof Mesh) ?? []
  );
}

/**
 * A probe's shank mesh, or null when the probe is not built.
 * @param scene Scene the probe was built in.
 * @param probeId Probe id whose shank mesh to get.
 */
export function getProbeShankMesh(scene: Scene, probeId: string): Mesh | null {
  const mesh = scene.getMeshByName(
    buildSceneEntityName(probeId, "probe", "shank_mesh")
  );
  return mesh instanceof Mesh ? mesh : null;
}

/**
 * Build a probe's shank, head stage, and rod meshes, or return its existing
 * transform node if already built.
 * @param scene Scene to build the probe in.
 * @param probe Probe to build.
 * @param experiment Experiment this probe belongs to (to extract probe interface definition).
 * @param gizmoManager Gizmo manager to add probe meshes to.
 * @param geometry Probe body geometry to build the meshes with.
 */
export function buildProbe(
  scene: Scene,
  probe: Probe,
  experiment: Experiment,
  gizmoManager: GizmoManager,
  geometry: ProbeGeometry
): TransformNode | null {
  const existing = getProbeTransformNode(scene, probe.id);
  if (existing) return existing;

  const probeInterfaceProbe = getInternedProbeInterfaceProbe(experiment, probe);
  if (!probeInterfaceProbe) return null;

  const contour = getProbeContour(probeInterfaceProbe);
  if (!contour) return null;

  const alignmentOffsetMillimeters = getProbeAlignmentOffsetMillimeters(
    getProbeShanks(probeInterfaceProbe, contour),
    probe.shankAlignmentIndex
  );

  const probeMetadata: ProbeMetadata = {
    probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe),
    shankAlignmentIndex: probe.shankAlignmentIndex,
    geometry,
    bodyModelId: probe.bodyModel?.modelId ?? null
  };

  const node = new TransformNode(
    buildSceneEntityName(probe.id, "probe", "node"),
    scene
  );
  node.metadata = probeMetadata;
  node.parent = buildAtlasRootNode(scene);

  const material = buildProbeMaterial(scene, probe);
  const shankMesh = buildShankMesh(
    scene,
    contour,
    buildSceneEntityName(probe.id, "probe", "shank_mesh"),
    geometry
  );
  shankMesh.material = material;
  shankMesh.parent = node;
  // Mesh vertices are in contour coords; this puts the aligned shank's tip on the node.
  shankMesh.position.x += alignmentOffsetMillimeters;

  gizmoManager.attachableMeshes ??= [];
  gizmoManager.attachableMeshes.push(shankMesh);

  // A body model replaces the head stage and rod, and its own convex hull
  // replaces their collision shapes once `syncProbeBodyModels` has imported it.
  if (!probe.bodyModel) {
    const headStageMesh = buildHeadStageMesh(
      scene,
      contour,
      buildSceneEntityName(probe.id, "probe", "head-stage_mesh"),
      geometry
    );
    headStageMesh.material = material;
    headStageMesh.parent = node;
    headStageMesh.position.x += alignmentOffsetMillimeters;

    const rodMesh = buildRodMesh(
      scene,
      contour,
      buildSceneEntityName(probe.id, "probe", "rod_mesh"),
      geometry
    );
    rodMesh.material = buildRodMaterial(scene);
    rodMesh.parent = node;
    rodMesh.position.x += alignmentOffsetMillimeters;

    // Ignore the return value: no physics engine on the scene keeps this feature additive.
    buildCollisionBody(node, probe.id, "probe", () => ({
      children: buildProbeCollisionShapes(
        scene,
        [rodMesh, headStageMesh],
        shankMesh
      )
    }));
    gizmoManager.attachableMeshes.push(headStageMesh, rodMesh);
  }

  return node;
}

/**
 * Dispose a probe's transform node, its meshes, and its own materials.
 * @param scene Scene the probe was built in.
 * @param probeId Probe ID to remove any existing entity for.
 * @param gizmoManager Gizmo manager to remove probe meshes from.
 */
export function disposeProbe(
  scene: Scene,
  probeId: string,
  gizmoManager: GizmoManager
): void {
  const probeTransformNode = getProbeTransformNode(scene, probeId);
  if (gizmoManager.attachedNode === probeTransformNode) {
    gizmoManager.attachToNode(null);
  }

  if (probeTransformNode) stopNodePoseInterpolation(probeTransformNode);
  disposeCollisionBody(scene, probeId, "probe");
  probeTransformNode?.dispose(false, false);
  scene
    .getMaterialByName(buildSceneEntityName(probeId, "probe", "material"))
    ?.dispose();
  gizmoManager.attachableMeshes = (gizmoManager.attachableMeshes ?? []).filter(
    mesh => !mesh.name.startsWith(probeId)
  );
}

/**
 * Synchronize the probe entities with their states.
 * @param scene Scene to sync the probes of.
 * @param experiment Experiment to pull probe data to sync from.
 * @param gizmoManager Gizmo manager for controlling probes.
 * @param draggedProbeId ID of the probe being dragged (if any). Ignore transform updates for this probe.
 * @param geometry Probe body geometry to build meshes with.
 * @param snapPoses Apply pose changes immediately instead of gliding to them, for a numeric input being scrubbed.
 */
export function syncProbes(
  scene: Scene,
  experiment: Experiment,
  gizmoManager: GizmoManager,
  draggedProbeId: string | null,
  geometry: ProbeGeometry,
  snapPoses = false
): string[] {
  const atlasRootNode = buildAtlasRootNode(scene);
  const experimentProbesById = new Map(
    experiment.probes.map(probe => [probe.id, probe])
  );

  const nodesById = new Map<string, TransformNode>();
  const rebuiltProbeIds: string[] = [];
  for (const node of atlasRootNode.getChildren(child =>
    child.name.endsWith(PROBE_NODE_SUFFIX)
  ) as TransformNode[]) {
    const id = sceneEntityIdFromName(node.name, "probe");
    const probe = experimentProbesById.get(id);
    const metadata = node.metadata as ProbeMetadata | null;
    if (
      !metadata ||
      !probe ||
      probe.probeInterfaceIdentifier !== metadata.probeInterfaceIdentifier ||
      probe.shankAlignmentIndex !== metadata.shankAlignmentIndex ||
      !isSameProbeGeometry(metadata.geometry, geometry) ||
      (probe.bodyModel?.modelId ?? null) !== metadata.bodyModelId
    ) {
      disposeProbe(scene, id, gizmoManager);
      if (probe) rebuiltProbeIds.push(id);
      continue;
    }
    nodesById.set(id, node);
  }

  for (const probe of experiment.probes) {
    const existingNode = nodesById.get(probe.id);
    const node =
      existingNode ??
      buildProbe(scene, probe, experiment, gizmoManager, geometry);
    if (!node) continue;

    const meshes = node.getChildMeshes(false);
    const shankMesh = meshes.find(mesh =>
      mesh.name.endsWith(SHANK_MESH_SUFFIX)
    );
    const headStageMesh = meshes.find(mesh =>
      mesh.name.endsWith(HEAD_STAGE_MESH_SUFFIX)
    );
    const rodMesh = meshes.find(mesh => mesh.name.endsWith(ROD_MESH_SUFFIX));

    const material = shankMesh?.material;
    if (material instanceof StandardMaterial) {
      setMaterialDiffuseColor(material, Color3.FromHexString(probe.color));
    }

    switch (probe.visibility) {
      case "visible":
        shankMesh?.setEnabled(true);
        headStageMesh?.setEnabled(true);
        rodMesh?.setEnabled(true);
        break;
      case "shanks":
        shankMesh?.setEnabled(true);
        headStageMesh?.setEnabled(false);
        rodMesh?.setEnabled(false);
        break;
      case "hidden":
      default:
        shankMesh?.setEnabled(false);
        headStageMesh?.setEnabled(false);
        rodMesh?.setEnabled(false);
        break;
    }

    if (probe.id === draggedProbeId) continue;

    const goalPosition = asrToVector3(probe.tipPosition);
    const goalRotation = asrToVector3(probe.rotation);
    // A pose that already matches needs no move, e.g. the sync right after a
    // gizmo drag ends. Checked before anything else so an unrelated sync never
    // cuts a glide short.
    if (
      node.position.equals(goalPosition) &&
      node.rotation.equals(goalRotation)
    ) {
      continue;
    }
    // A freshly built probe snaps, so it doesn't fly in from the origin, and a
    // scrubbed one snaps so it tracks the pointer. Anything else glides.
    if (!existingNode || snapPoses) {
      stopNodePoseInterpolation(node);
      node.position = goalPosition;
      node.rotation = goalRotation;
      continue;
    }

    interpolateNodePose(scene, node, {
      position: goalPosition,
      rotation: goalRotation,
      scaling: node.scaling
    });
  }

  return rebuiltProbeIds;
}

/**
 * Attach the gizmo to a probe's transform node and select its meshes, leaving
 * a locked probe outlined but without a gizmo.
 * @param gizmoManager Gizmo manager to attach to the probe's node.
 * @param selectionOutlineLayer Selection outline layer to add the probe's meshes to.
 * @param probe Probe being selected, whose lock decides whether a gizmo attaches.
 * @param probeTransformNode Probe transform node to attach and select.
 * @param gizmoNode Node the gizmo attaches to - the probe's node, or its body model's while that gizmo is attached.
 */
export function attachProbeSelection(
  gizmoManager: GizmoManager,
  selectionOutlineLayer: SelectionOutlineLayer,
  probe: Probe,
  probeTransformNode: TransformNode,
  gizmoNode: TransformNode
): void {
  gizmoManager.attachToNode(probe.lock ? null : gizmoNode);
  selectionOutlineLayer.clearSelection();
  selectionOutlineLayer.addSelection(probeTransformNode.getChildMeshes());
}

/**
 * Select a probe in the scene based on the Gizmo's pick.
 * @param scene Scene with probes.
 * @param gizmoManager Gizmo manager to update.
 * @param selectionOutlineLayer Selection outline layer to add probe to selection.
 * @param probes Experiment probes to resolve the attached mesh against.
 * @param resolveGizmoNode Resolve the node the gizmo attaches to for a selected probe.
 * @param onSelect Callback invoked with the probe whose mesh was attached to.
 */
export function selectProbeFromGizmoAttach(
  scene: Scene,
  gizmoManager: GizmoManager,
  selectionOutlineLayer: SelectionOutlineLayer,
  probes: Probe[],
  resolveGizmoNode: (
    probe: Probe,
    probeTransformNode: TransformNode
  ) => TransformNode,
  onSelect: (probe: Probe) => void
): Observer<Nullable<AbstractMesh>> {
  return gizmoManager.onAttachedToMeshObservable.add(mesh => {
    if (!mesh) return;
    if (!isSceneEntityName(mesh.name, "probe")) return;

    const probeId = sceneEntityIdFromName(mesh.name, "probe");
    const probeTransformNode = getProbeTransformNode(scene, probeId);
    if (!probeTransformNode) return;

    const probe = probes.find(probe => probe.id === probeId);
    if (!probe) return;

    attachProbeSelection(
      gizmoManager,
      selectionOutlineLayer,
      probe,
      probeTransformNode,
      resolveGizmoNode(probe, probeTransformNode)
    );
    onSelect(probe);
  });
}

/**
 * Update a probe's position from a gizmo drag.
 * @param positionGizmo Position gizmo to track dragging on.
 * @param probes Experiment probes to resolve the attached mesh against.
 * @param onDrag Callback invoked with probe ID the drag is happening to.
 */
export function setProbePositionFromGizmoDrag(
  positionGizmo: IPositionGizmo,
  probes: Probe[],
  onDrag: (probeId: string) => void
): Observer<DragEvent> {
  return positionGizmo.onDragObservable.add(() => {
    const attached = attachedProbeFromGizmo(positionGizmo, probes);
    if (!attached) return;
    stopNodePoseInterpolation(attached.node);
    attached.probe.tipPosition = vector3ToAsr(attached.node.position);
    onDrag(attached.probe.id);
  });
}

/**
 * Update a probe's orientation from a gizmo drag.
 * @param rotationGizmo Rotation gizmo to track dragging on.
 * @param probes Experiment probes to resolve the attached mesh against.
 * @param onDrag Callback invoked with probe ID the drag is happening to.
 */
export function setProbeRotationFromGizmoDrag(
  rotationGizmo: IRotationGizmo,
  probes: Probe[],
  onDrag: (probeId: string) => void
): Observer<DragEvent> {
  return rotationGizmo.onDragObservable.add(() => {
    const attached = attachedProbeFromGizmo(rotationGizmo, probes);
    if (!attached) return;

    stopNodePoseInterpolation(attached.node);
    attached.probe.rotation = vector3ToAsr(attached.node.rotation);
    onDrag(attached.probe.id);
  });
}

/**
 * Callback filter for when dragging finishes on a probe, from either the
 * position or the rotation gizmo.
 * @param gizmos Position and rotation gizmos to track dragging on.
 * @param onDragEnd Callback invoked to confirm probe drag ended.
 */
export function endProbeGizmoDrag(
  gizmos: TransformGizmos,
  onDragEnd: () => void
): Observer<DragStartEndEvent>[] {
  const onEnd = (gizmo: IGizmo) => () => {
    if (!gizmo.attachedNode?.name.endsWith(PROBE_NODE_SUFFIX)) return;
    onDragEnd();
  };

  return [
    gizmos.positionGizmo.onDragEndObservable.add(onEnd(gizmos.positionGizmo)),
    gizmos.rotationGizmo.onDragEndObservable.add(onEnd(gizmos.rotationGizmo))
  ];
}

/**
 * Resolve the probe and transform node currently attached to the gizmo, or
 * null if nothing (or a non-probe entity) is attached.
 * @param gizmo Gizmo to read the attached node from.
 * @param probes Experiment probes to resolve the attached mesh against.
 */
function attachedProbeFromGizmo(
  gizmo: IGizmo,
  probes: Probe[]
): { probe: Probe; node: TransformNode } | null {
  const node = gizmo.attachedNode;
  if (!node?.name.endsWith(PROBE_NODE_SUFFIX)) return null;

  const probeId = sceneEntityIdFromName(node.name, "probe");
  const probe = probes.find(probe => probe.id === probeId);
  if (!probe) return null;

  return { probe, node: node as TransformNode };
}

/**
 * Convex hulls for the rod and head stage plus an axis-aligned box for the shanks.
 * @param scene Scene to build the shapes in.
 * @param hullMeshes Meshes to bound with convex hulls (rod, head stage).
 * @param boxMesh Mesh to bound with an axis-aligned box (shanks).
 */
function buildProbeCollisionShapes(
  scene: Scene,
  hullMeshes: Mesh[],
  boxMesh: Mesh
): { shape: PhysicsShape; mesh: Mesh }[] {
  return [
    ...hullMeshes.map(mesh => ({
      shape: new PhysicsShapeConvexHull(mesh, scene),
      mesh
    })),
    { shape: PhysicsShapeBox.FromMesh(boxMesh), mesh: boxMesh }
  ];
}

/**
 * Build a probe's shank-and-head-stage material, colored from the probe.
 * @param scene Scene to build the material in.
 * @param probe Probe to derive the material's color from.
 */
function buildProbeMaterial(scene: Scene, probe: Probe): StandardMaterial {
  const material = new StandardMaterial(
    buildSceneEntityName(probe.id, "probe", "material"),
    scene
  );
  material.diffuseColor = Color3.FromHexString(probe.color);
  material.freeze();
  return material;
}

/**
 * Extrude the probe's contour into a thin shank mesh.
 * @param scene Scene to build the mesh in.
 * @param contour Probe contour to extrude.
 * @param name Name for the mesh.
 * @param geometry Probe body geometry to build the mesh with.
 */
export function buildShankMesh(
  scene: Scene,
  contour: ProbeContour,
  name: string,
  geometry: ProbeGeometry
): Mesh {
  const mesh = ExtrudePolygon(
    name,
    {
      shape: contour.points.map(({ x, y }) => new Vector3(x, 0, y)),
      depth: geometry.shankThicknessMillimeters,
      sideOrientation: Mesh.DOUBLESIDE
    },
    scene,
    earcut
  );
  mesh.position = new Vector3(0, geometry.shankThicknessMillimeters / 2, 0);
  return mesh;
}

/**
 * Build the truncated cone ("head stage") sitting on top of the probe's shanks.
 * @param scene Scene to build the mesh in.
 * @param contour Probe contour the head stage sits on top of.
 * @param name Name for the mesh.
 * @param geometry Probe body geometry to build the mesh with.
 */
export function buildHeadStageMesh(
  scene: Scene,
  contour: ProbeContour,
  name: string,
  geometry: ProbeGeometry
): Mesh {
  const baseMesh = MeshBuilder.CreateCylinder(
    `${name}_base`,
    {
      height: geometry.headStageLengthMillimeters,
      diameterBottom: contour.widthMillimeters,
      diameterTop: geometry.rodDiameterMillimeters
    },
    scene
  );
  baseMesh.rotation = new Vector3(Math.PI / 2, 0, 0);
  baseMesh.position = new Vector3(
    0,
    0,
    contour.heightMillimeters + geometry.headStageLengthMillimeters / 2
  );
  const cutterMesh = MeshBuilder.CreateBox(
    `${name}_cutter`,
    {
      size: geometry.rodDiameterMillimeters,
      height: geometry.headStageLengthMillimeters
    },
    scene
  );
  // This position resolves to probe-local -Y once parented under the
  // pitched base mesh - that is the contact face, so the sign here is
  // load-bearing.
  cutterMesh.position = new Vector3(
    0,
    geometry.headStageCutDepthMillimeters - geometry.headStageLengthMillimeters,
    geometry.rodDiameterMillimeters / 2 + geometry.shankThicknessMillimeters / 2
  );
  cutterMesh.parent = baseMesh;

  const baseCSG = CSG2.FromMesh(baseMesh);
  const cutterCSG = CSG2.FromMesh(cutterMesh);
  const resultCSG = baseCSG.subtract(cutterCSG);
  const mesh = resultCSG.toMesh(name, scene, { rebuildNormals: true });
  mesh.position = new Vector3(
    0,
    0,
    contour.heightMillimeters + geometry.headStageLengthMillimeters / 2
  );

  // Cleanup base mesh and CSG manifolds (not GC'd; wrap native WASM memory).
  baseMesh.dispose();
  baseCSG.dispose();
  cutterCSG.dispose();
  resultCSG.dispose();

  return mesh;
}

/**
 * Build the rod sitting on top of the probe's head stage.
 * @param scene Scene to build the mesh in.
 * @param contour Probe contour the head stage (and rod) sit on top of.
 * @param name Name for the mesh.
 * @param geometry Probe body geometry to build the mesh with.
 */
function buildRodMesh(
  scene: Scene,
  contour: ProbeContour,
  name: string,
  geometry: ProbeGeometry
): Mesh {
  const mesh = MeshBuilder.CreateCylinder(
    name,
    {
      height: geometry.rodLengthMillimeters,
      diameter: geometry.rodDiameterMillimeters
    },
    scene
  );
  mesh.rotation = new Vector3(Math.PI / 2, 0, 0);
  mesh.position = new Vector3(
    0,
    0,
    contour.heightMillimeters +
      geometry.headStageLengthMillimeters +
      geometry.rodLengthMillimeters / 2
  );
  return mesh;
}

/**
 * Build the scene's shared grey rod material, or return the existing one.
 * @param scene Scene to get the rod material from.
 */
function buildRodMaterial(scene: Scene): StandardMaterial {
  const existing = scene.getMaterialByName(ROD_MATERIAL_NAME);
  if (existing instanceof StandardMaterial) return existing;

  const material = new StandardMaterial(ROD_MATERIAL_NAME, scene);
  material.diffuseColor = Color3.Gray();
  material.freeze();
  return material;
}

/**
 * Do two probe body geometries match on every dimension.
 * @param a First geometry to compare.
 * @param b Second geometry to compare.
 */
export function isSameProbeGeometry(
  a: ProbeGeometry,
  b: ProbeGeometry
): boolean {
  return (
    a.shankThicknessMillimeters === b.shankThicknessMillimeters &&
    a.headStageLengthMillimeters === b.headStageLengthMillimeters &&
    a.headStageCutDepthMillimeters === b.headStageCutDepthMillimeters &&
    a.rodDiameterMillimeters === b.rodDiameterMillimeters &&
    a.rodLengthMillimeters === b.rodLengthMillimeters
  );
}
