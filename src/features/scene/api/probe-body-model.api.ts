import type {
  DragEvent,
  DragStartEndEvent,
  GizmoManager,
  IGizmo,
  IPositionGizmo,
  IRotationGizmo,
  IScaleGizmo,
  Observer,
  Scene
} from "@babylonjs/core";
import {
  ImportMeshAsync,
  Mesh,
  PhysicsShapeBox,
  PhysicsShapeConvexHull,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import type { Experiment } from "@/features/experiment";
import type { Probe } from "@/features/probe";
import type { SceneModel } from "../models/scene-model.model";
import type { TransformGizmos } from "../models/gizmo.model";
import {
  buildCollisionBody,
  buildColliderMesh,
  disposeCollisionBody
} from "./collision.api";
import {
  buildSceneEntityName,
  sceneEntityIdFromName,
  sceneEntityNameSuffix
} from "./scene-entity.api";
import { getProbeShankMesh, getProbeTransformNode } from "./probe.api";

/** Suffix applied to a probe's id to name its body model transform node. */
const BODY_MODEL_NODE_SUFFIX = sceneEntityNameSuffix(
  "probe",
  "body-model_node"
);

/** Load bookkeeping for probe body models, so a re-sync neither double-builds nor retries forever. */
export interface ProbeBodyModelSyncState {
  /** Probe ids whose body model file is being loaded right now. */
  loadingIds: Set<string>;
  /** Probe ids whose body model file failed to load, cleared when the probe loses its model. */
  failedIds: Set<string>;
  /** Probe ids whose collider failed to cook, so a sync doesn't retry every tick. */
  colliderFailedIds: Set<string>;
  /** Local pose each probe's body-model hull was cooked at, so a pose change re-cooks it. */
  colliderPoses: Map<string, string>;
}

/** Build empty probe body model load bookkeeping. */
export function createProbeBodyModelSyncState(): ProbeBodyModelSyncState {
  return {
    loadingIds: new Set(),
    failedIds: new Set(),
    colliderFailedIds: new Set(),
    colliderPoses: new Map()
  };
}

/**
 * Get a probe's body model transform node, or null when it isn't built.
 * @param scene Scene the probe was built in.
 * @param probeId Probe id whose body model node to get.
 */
export function getProbeBodyModelNode(
  scene: Scene,
  probeId: string
): TransformNode | null {
  const node = scene.getTransformNodeByName(
    buildSceneEntityName(probeId, "probe", "body-model_node")
  );
  return node instanceof TransformNode ? node : null;
}

/**
 * A probe's body model part meshes, or an empty list when it isn't built.
 * @param scene Scene the probe was built in.
 * @param probeId Probe id whose body model meshes to get.
 */
export function getProbeBodyModelMeshes(scene: Scene, probeId: string): Mesh[] {
  return (
    getProbeBodyModelNode(scene, probeId)
      ?.getChildMeshes(false)
      .filter(
        (mesh): mesh is Mesh =>
          mesh instanceof Mesh && mesh.getTotalVertices() > 0
      ) ?? []
  );
}

/**
 * Node a probe's gizmo attaches to: its body model node while that model holds
 * the gizmo, otherwise the probe's own node.
 * @param scene Scene the probe was built in.
 * @param probe Probe whose gizmo target to resolve.
 * @param probeNode Probe transform node, returned when no body model gizmo applies.
 * @param bodyModelGizmoProbeId Probe id whose body model holds the gizmo, or null.
 */
export function getProbeGizmoNode(
  scene: Scene,
  probe: Probe,
  probeNode: TransformNode,
  bodyModelGizmoProbeId: string | null
): TransformNode {
  if (probe.id !== bodyModelGizmoProbeId || !probe.bodyModel) return probeNode;
  return getProbeBodyModelNode(scene, probe.id) ?? probeNode;
}

/**
 * Update a probe's body model position from a gizmo drag.
 * @param positionGizmo Position gizmo to track dragging on.
 * @param probes Experiment probes to resolve the attached node against.
 * @param onDrag Callback invoked with the probe id the drag is happening to.
 */
export function setProbeBodyModelPositionFromGizmoDrag(
  positionGizmo: IPositionGizmo,
  probes: Probe[],
  onDrag: (probeId: string) => void
): Observer<DragEvent> {
  return positionGizmo.onDragObservable.add(() => {
    const attached = attachedProbeBodyModelFromGizmo(positionGizmo, probes);
    if (!attached) return;
    attached.bodyModel.position = vector3ToTriple(attached.node.position);
    onDrag(attached.probe.id);
  });
}

/**
 * Update a probe's body model orientation from a gizmo drag.
 * @param rotationGizmo Rotation gizmo to track dragging on.
 * @param probes Experiment probes to resolve the attached node against.
 * @param onDrag Callback invoked with the probe id the drag is happening to.
 */
export function setProbeBodyModelRotationFromGizmoDrag(
  rotationGizmo: IRotationGizmo,
  probes: Probe[],
  onDrag: (probeId: string) => void
): Observer<DragEvent> {
  return rotationGizmo.onDragObservable.add(() => {
    const attached = attachedProbeBodyModelFromGizmo(rotationGizmo, probes);
    if (!attached) return;
    attached.bodyModel.rotation = vector3ToTriple(attached.node.rotation);
    onDrag(attached.probe.id);
  });
}

/**
 * Update a probe's body model scale from a gizmo drag.
 * @param scaleGizmo Scale gizmo to track dragging on.
 * @param probes Experiment probes to resolve the attached node against.
 * @param onDrag Callback invoked with the probe id the drag is happening to.
 */
export function setProbeBodyModelScaleFromGizmoDrag(
  scaleGizmo: IScaleGizmo,
  probes: Probe[],
  onDrag: (probeId: string) => void
): Observer<DragEvent> {
  return scaleGizmo.onDragObservable.add(() => {
    const attached = attachedProbeBodyModelFromGizmo(scaleGizmo, probes);
    if (!attached) return;
    attached.bodyModel.scale = vector3ToTriple(attached.node.scaling);
    onDrag(attached.probe.id);
  });
}

/**
 * Callback filter for when dragging finishes on a probe's body model, from
 * the position, rotation, or scale gizmo.
 * @param gizmos Position, rotation, and scale gizmos to track dragging on.
 * @param onDragEnd Callback invoked to confirm the body model drag ended.
 */
export function endProbeBodyModelGizmoDrag(
  gizmos: TransformGizmos,
  onDragEnd: () => void
): Observer<DragStartEndEvent>[] {
  const onEnd = (gizmo: IGizmo) => () => {
    if (!gizmo.attachedNode?.name.endsWith(BODY_MODEL_NODE_SUFFIX)) return;
    onDragEnd();
  };

  return [
    gizmos.positionGizmo.onDragEndObservable.add(onEnd(gizmos.positionGizmo)),
    gizmos.rotationGizmo.onDragEndObservable.add(onEnd(gizmos.rotationGizmo)),
    gizmos.scaleGizmo.onDragEndObservable.add(onEnd(gizmos.scaleGizmo))
  ];
}

/**
 * Build a probe's body model visuals under its transform node, skinned with the
 * probe's own material, or null when the file holds no geometry.
 * @param scene Scene to build the body model in.
 * @param probe Probe whose body model to build.
 * @param modelFile Model file to import, exactly as the user picked it.
 * @param gizmoManager Gizmo manager to add the body model's meshes to.
 */
export async function buildProbeBodyModelNode(
  scene: Scene,
  probe: Probe,
  modelFile: File,
  gizmoManager: GizmoManager
): Promise<TransformNode | null> {
  const existing = getProbeBodyModelNode(scene, probe.id);
  if (existing) return existing;

  const probeNode = getProbeTransformNode(scene, probe.id);
  if (!probeNode) return null;

  const node = new TransformNode(
    buildSceneEntityName(probe.id, "probe", "body-model_node"),
    scene
  );
  node.parent = probeNode;

  const result = await ImportMeshAsync(modelFile, scene, {});
  const meshes = result.meshes.filter(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0
  );
  if (meshes.length === 0) {
    for (const mesh of result.meshes) if (!mesh.isDisposed()) mesh.dispose();
    for (const transformNode of result.transformNodes) {
      transformNode.dispose();
    }
    node.dispose();
    return null;
  }

  // Reparent the loader's own roots (glTF's `__root__` handedness conversion,
  // or the bare meshes an OBJ produces) under the body model node, verbatim --
  // this is what makes the geometry render exactly as the loader intended.
  for (const root of [...result.meshes, ...result.transformNodes]) {
    if (root.parent) continue;
    root.name = buildSceneEntityName(probe.id, "probe", "body-model_root");
    root.parent = node;
  }

  // Skin every part with the probe's own frozen material -- always present
  // because the probe node exists -- dropping the loader's own materials.
  const material = scene.getMaterialByName(
    buildSceneEntityName(probe.id, "probe", "material")
  );
  const loadedMaterials = new Set(
    meshes.map(mesh => mesh.material).filter(loaded => loaded !== null)
  );
  meshes.forEach((mesh, index) => {
    mesh.name = buildSceneEntityName(
      probe.id,
      "probe",
      `body-model_mesh${index}`
    );
    mesh.material = material;
  });
  for (const loaded of loadedMaterials) loaded.dispose(false, true);

  // Clicking the model selects the probe -- `selectProbeFromGizmoAttach`
  // resolves `${probeId}_probe_...` names already.
  gizmoManager.attachableMeshes ??= [];
  gizmoManager.attachableMeshes.push(...meshes);
  return node;
}

/** Build a pose-identity string, so an unchanged local pose skips re-cooking. */
function buildBodyModelPoseKey(bodyModel: SceneModel): string {
  return `${bodyModel.position.join(",")}|${bodyModel.rotation.join(",")}|${bodyModel.scale.join(",")}`;
}

/**
 * Cook a probe's trigger body from its body model's convex hull plus a box
 * around its shanks, replacing the head-stage and rod hulls.
 * @param scene Scene the probe was built in.
 * @param probeId Probe id the body belongs to.
 * @param probeNode Probe transform node to parent the collider to.
 * @param shankMesh Shank mesh to bound with an axis-aligned box.
 * @param bodyModelMeshes Body model part meshes to enclose in one hull.
 */
function buildProbeBodyModelCollisionBody(
  scene: Scene,
  probeId: string,
  probeNode: TransformNode,
  shankMesh: Mesh,
  bodyModelMeshes: Mesh[]
): void {
  const hull = buildColliderMesh(
    scene,
    probeNode,
    buildSceneEntityName(probeId, "probe", "body-model_hull"),
    bodyModelMeshes,
    Vector3.One()
  );
  try {
    buildCollisionBody(probeNode, probeId, "probe", () => ({
      children: [
        { shape: new PhysicsShapeConvexHull(hull, scene), mesh: hull },
        { shape: PhysicsShapeBox.FromMesh(shankMesh), mesh: shankMesh }
      ]
    }));
  } finally {
    hull.dispose();
  }
}

/**
 * Synchronize probe body models with their states: builds each from its stored
 * file, applies its local pose, shows or hides it with the probe, and cooks the
 * probe's convex-hull collider.
 * @param scene Scene holding the probe entities.
 * @param experiment Experiment whose probes to sync.
 * @param gizmoManager Gizmo manager to add fresh body models' meshes to.
 * @param state Load bookkeeping, mutated in place.
 * @param draggedProbeId Probe id whose body model is under a gizmo drag, skipped for pose and collider updates.
 * @param loadModel Loader for a stored model file, by model id.
 */
export async function syncProbeBodyModels(
  scene: Scene,
  experiment: Experiment,
  gizmoManager: GizmoManager,
  state: ProbeBodyModelSyncState,
  draggedProbeId: string | null,
  loadModel: (modelId: string) => Promise<File | null>
): Promise<{
  failedIds: string[];
  colliderFailedIds: string[];
  colliderChangedIds: string[];
}> {
  const modelProbesById = new Map(
    experiment.probes
      .filter(probe => probe.bodyModel)
      .map(probe => [probe.id, probe])
  );

  for (const id of state.loadingIds) {
    if (!modelProbesById.has(id)) state.loadingIds.delete(id);
  }
  for (const id of state.failedIds) {
    if (!modelProbesById.has(id)) state.failedIds.delete(id);
  }
  for (const id of state.colliderFailedIds) {
    if (!modelProbesById.has(id)) state.colliderFailedIds.delete(id);
  }
  for (const id of state.colliderPoses.keys()) {
    if (!modelProbesById.has(id)) state.colliderPoses.delete(id);
  }

  const failedIds: string[] = [];
  const colliderFailedIds: string[] = [];
  // Ids whose collider was disposed this pass (attached, replaced, or
  // re-cooked for a new pose). Havok emits no TRIGGER_EXITED when a body is
  // disposed while overlapping, so the caller must force-drop any stale pair
  // for these ids.
  const colliderChangedIds: string[] = [];

  for (const probe of modelProbesById.values()) {
    const bodyModel = probe.bodyModel!;

    // `syncProbes` owns the probe node; a probe not yet built is picked up by
    // the next sync, and it is not marked failed.
    const probeNode = getProbeTransformNode(scene, probe.id);
    if (!probeNode) continue;

    let node = getProbeBodyModelNode(scene, probe.id);
    if (!node) {
      // A missing node means `syncProbes` rebuilt the probe and took its
      // collider, so no cooked pose holds any more -- this is also what
      // makes delete-then-upload re-cook, since both poses stringify
      // identically.
      state.colliderPoses.delete(probe.id);
      state.colliderFailedIds.delete(probe.id);
      if (state.loadingIds.has(probe.id) || state.failedIds.has(probe.id)) {
        continue;
      }
      state.loadingIds.add(probe.id);
      try {
        const modelFile = await loadModel(bodyModel.id);
        node = modelFile
          ? await buildProbeBodyModelNode(scene, probe, modelFile, gizmoManager)
          : null;
      } catch {
        node = null;
      } finally {
        state.loadingIds.delete(probe.id);
      }
      // The scene can be torn down while a model loads.
      if (scene.isDisposed) {
        return { failedIds, colliderFailedIds, colliderChangedIds };
      }
      if (!node) {
        state.failedIds.add(probe.id);
        failedIds.push(probe.id);
        continue;
      }
    }

    // The model stands in for the head stage and rod, so it is hidden in
    // "shanks" and "hidden".
    node.setEnabled(probe.visibility === "visible");

    // Skip pose and collider updates for the body model being dragged: a
    // gizmo drag must not re-cook the hull every frame. Once `endProbeDrag`
    // clears `draggedProbeId`, the watcher re-runs and it re-cooks once at
    // the released pose.
    if (probe.id === draggedProbeId) continue;

    // Applied verbatim, not through `asrToVector3`: these are Babylon local
    // XYZ relative to the probe node, not ASR. Set before cooking the hull,
    // which reads world matrices.
    node.position = new Vector3(...bodyModel.position);
    node.rotation = new Vector3(...bodyModel.rotation);
    node.scaling = new Vector3(...bodyModel.scale);

    const poseKey = buildBodyModelPoseKey(bodyModel);
    if (
      state.colliderFailedIds.has(probe.id) ||
      state.colliderPoses.get(probe.id) === poseKey
    ) {
      continue;
    }

    const shankMesh = getProbeShankMesh(scene, probe.id);
    const meshes = getProbeBodyModelMeshes(scene, probe.id);
    if (!shankMesh || !meshes.length) continue;

    const hasCollider = !!scene.getTransformNodeByName(
      buildSceneEntityName(probe.id, "probe", "collider")
    );
    if (hasCollider) {
      disposeCollisionBody(scene, probe.id, "probe");
      colliderChangedIds.push(probe.id);
    }
    try {
      buildProbeBodyModelCollisionBody(
        scene,
        probe.id,
        probeNode,
        shankMesh,
        meshes
      );
      state.colliderPoses.set(probe.id, poseKey);
    } catch {
      state.colliderFailedIds.add(probe.id);
      colliderFailedIds.push(probe.id);
    }
  }

  return { failedIds, colliderFailedIds, colliderChangedIds };
}

/** Babylon local vector as a plain triple, matching a body model's verbatim pose fields. */
function vector3ToTriple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

/**
 * Resolve the probe body model and node currently attached to the gizmo, or
 * null when something else is attached.
 * @param gizmo Gizmo to read the attached node from.
 * @param probes Experiment probes to resolve the attached node against.
 */
function attachedProbeBodyModelFromGizmo(
  gizmo: IGizmo,
  probes: Probe[]
): { probe: Probe; bodyModel: SceneModel; node: TransformNode } | null {
  const node = gizmo.attachedNode;
  if (!node?.name.endsWith(BODY_MODEL_NODE_SUFFIX)) return null;

  const probeId = sceneEntityIdFromName(node.name, "probe");
  const probe = probes.find(probe => probe.id === probeId);
  if (!probe?.bodyModel) return null;

  return { probe, bodyModel: probe.bodyModel, node: node as TransformNode };
}
