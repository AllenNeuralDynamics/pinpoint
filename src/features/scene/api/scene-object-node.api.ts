import type {
  AbstractMesh,
  DragEvent,
  DragStartEndEvent,
  GizmoManager,
  IGizmo,
  IPositionGizmo,
  IRotationGizmo,
  IScaleGizmo,
  Nullable,
  Observer,
  Scene,
  SelectionOutlineLayer
} from "@babylonjs/core";
import {
  Color3,
  ImportMeshAsync,
  Mesh,
  PhysicsShapeMesh,
  StandardMaterial,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import type { Experiment } from "@/features/experiment";
import { setMaterialDiffuseColor } from "./material.api";
import { buildAtlasRootNode } from "./structures.api";
import { asrToVector3, vector3ToAsr } from "./coordinate-transforms.api";
import {
  buildCollisionBody,
  buildColliderMesh,
  disposeCollisionBody
} from "./collision.api";
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
import type { SceneObject } from "../models/scene-object.model";
import type { TransformGizmos } from "../models/gizmo.model";

/** Suffix applied to a scene object's id to name its parenting transform node. */
const SCENE_OBJECT_NODE_SUFFIX = sceneEntityNameSuffix("object", "node");

/** Load bookkeeping for scene object models, so a re-sync neither double-builds nor retries forever. */
export interface SceneObjectSyncState {
  /** Ids whose model file is being loaded right now. */
  loadingIds: Set<string>;
  /** Ids whose model file failed to load, cleared when the id leaves the experiment. */
  failedIds: Set<string>;
  /**
   * Ids whose collider failed to build, so a sync doesn't retry every tick.
   * Cleared when the id leaves the experiment or `collidable` turns off.
   */
  colliderFailedIds: Set<string>;
  /** Scale each object's collider was cooked at, so a scale change re-cooks it. */
  colliderScales: Map<string, [number, number, number]>;
}

/** Build empty scene object load bookkeeping. */
export function createSceneObjectSyncState(): SceneObjectSyncState {
  return {
    loadingIds: new Set(),
    failedIds: new Set(),
    colliderFailedIds: new Set(),
    colliderScales: new Map()
  };
}

/**
 * Get a scene object's transform node by ID.
 * @param scene Scene to search for the object.
 * @param sceneObjectId ID of the scene object to get.
 */
export function getSceneObjectTransformNode(
  scene: Scene,
  sceneObjectId: string
): TransformNode | null {
  return scene.getTransformNodeByName(
    buildSceneEntityName(sceneObjectId, "object", "node")
  );
}

/**
 * Get a scene object's scale node, the child carrying its scale, or null when
 * it isn't built.
 * @param scene Scene to search for the node.
 * @param sceneObjectId Scene object id whose scale node to get.
 */
function getSceneObjectScaleNode(
  scene: Scene,
  sceneObjectId: string
): TransformNode | null {
  return scene.getTransformNodeByName(
    buildSceneEntityName(sceneObjectId, "object", "scale")
  );
}

/**
 * Get or build a scene object's scale node, keeping the gizmo-attached object
 * node unscaled so the rotation gizmo works in local space at any scale.
 * @param sceneObjectNode Scene object transform node to parent the scale node to.
 * @param sceneObjectId Scene object id to name the scale node after.
 */
function buildSceneObjectScaleNode(
  sceneObjectNode: TransformNode,
  sceneObjectId: string
): TransformNode {
  const scene = sceneObjectNode.getScene();
  const existing = getSceneObjectScaleNode(scene, sceneObjectId);
  if (existing) return existing;

  const scaleNode = new TransformNode(
    buildSceneEntityName(sceneObjectId, "object", "scale"),
    scene
  );
  scaleNode.parent = sceneObjectNode;
  return scaleNode;
}

/**
 * A scene object's part meshes, or an empty list when the object is not built.
 * @param scene Scene the object was built in.
 * @param sceneObjectId Scene object id whose meshes to get.
 */
export function getSceneObjectMeshes(
  scene: Scene,
  sceneObjectId: string
): Mesh[] {
  return (
    getSceneObjectTransformNode(scene, sceneObjectId)
      ?.getChildMeshes(false)
      .filter(
        (mesh): mesh is Mesh =>
          mesh instanceof Mesh && mesh.getTotalVertices() > 0
      ) ?? []
  );
}

/**
 * Build a scene object's material, colored from the object.
 * @param scene Scene to build the material in.
 * @param sceneObject Scene object to derive the material's color from.
 */
function buildSceneObjectMaterial(
  scene: Scene,
  sceneObject: SceneObject
): StandardMaterial {
  const material = new StandardMaterial(
    buildSceneEntityName(sceneObject.id, "object", "material"),
    scene
  );
  material.diffuseColor = Color3.FromHexString(sceneObject.color);
  material.freeze();
  return material;
}

/** Result of building a scene object's node. */
export interface SceneObjectBuild {
  node: TransformNode;
  /**
   * True when the object's trigger collider couldn't be created from its mesh.
   * The object still renders, moves, and can be selected normally; it just
   * never participates in collision detection.
   */
  colliderFailed: boolean;
}

/**
 * Cook the object's single triangle-mesh trigger collider from its parts.
 * @param scene Scene the object was built in.
 * @param node Object transform node to parent the collider to.
 * @param scaleNode Scale node the collider geometry is baked in the frame of.
 * @param sceneObjectId Scene object id the collider belongs to.
 * @param meshes Part meshes to cook.
 * @param scaling Scale to cook the collider at.
 */
function buildSceneObjectCollider(
  scene: Scene,
  node: TransformNode,
  scaleNode: TransformNode,
  sceneObjectId: string,
  meshes: Mesh[],
  scaling: Vector3
): void {
  const colliderMesh = buildColliderMesh(
    scene,
    scaleNode,
    buildSceneEntityName(sceneObjectId, "object", "collider-mesh"),
    meshes,
    scaling
  );
  try {
    buildCollisionBody(node, sceneObjectId, "object", () => {
      // Havok cooks a triangle-less mesh into a shape that silently never
      // collides; fail instead so the caller reports it to the user.
      if (colliderMesh.getTotalIndices() === 0) {
        throw new Error(
          "Scene object model has no triangles to cook a collider from."
        );
      }
      return { root: new PhysicsShapeMesh(colliderMesh, scene) };
    });
  } finally {
    colliderMesh.dispose();
  }
}

/**
 * Build a scene object's visuals from its stored model file, or return its
 * existing transform node if already built. The collider is a triangle mesh
 * matching its parts, or none when the object's `collidable` is off.
 * @param scene Scene to build the object in.
 * @param sceneObject Scene object to build.
 * @param modelFile Model file to import the object's geometry from, exactly as the user picked it.
 * @param gizmoManager Gizmo manager to add the object's meshes to.
 */
export async function buildSceneObjectNode(
  scene: Scene,
  sceneObject: SceneObject,
  modelFile: File,
  gizmoManager: GizmoManager
): Promise<SceneObjectBuild | null> {
  const existing = getSceneObjectTransformNode(scene, sceneObject.id);
  if (existing) return { node: existing, colliderFailed: false };

  const node = new TransformNode(
    buildSceneEntityName(sceneObject.id, "object", "node"),
    scene
  );
  node.parent = buildAtlasRootNode(scene);
  const scaleNode = buildSceneObjectScaleNode(node, sceneObject.id);

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
  // or the bare meshes an OBJ produces) under the object node, verbatim --
  // this is what makes the geometry render exactly as the loader intended.
  for (const root of [...result.meshes, ...result.transformNodes]) {
    if (root.parent) continue;
    root.name = buildSceneEntityName(sceneObject.id, "object", "root");
    root.parent = scaleNode;
  }

  // Name and skin every part with one shared material; the object's colour
  // picker is the single source of its appearance, so a source file's own
  // materials are dropped here.
  const material = buildSceneObjectMaterial(scene, sceneObject);
  const loadedMaterials = new Set(
    meshes.map(mesh => mesh.material).filter(loaded => loaded !== null)
  );
  meshes.forEach((mesh, index) => {
    mesh.name = buildSceneEntityName(sceneObject.id, "object", `mesh${index}`);
    mesh.material = material;
  });
  for (const loaded of loadedMaterials) loaded.dispose(false, true);

  // No physics engine on the scene, or `collidable` turned off, keeps this
  // feature additive: the collider is never cooked, so it never throws, and
  // `colliderFailed` stays false. Some topologies can't be cooked into a
  // Havok collision shape (e.g. a model with no triangles); the object
  // still gets placed, without a collider.
  let colliderFailed = false;
  if (sceneObject.collidable) {
    try {
      buildSceneObjectCollider(
        scene,
        node,
        scaleNode,
        sceneObject.id,
        meshes,
        asrToVector3(sceneObject.scale)
      );
    } catch {
      colliderFailed = true;
    }
  }

  gizmoManager.attachableMeshes ??= [];
  gizmoManager.attachableMeshes.push(...meshes);
  return { node, colliderFailed };
}

/**
 * Dispose a scene object's transform node, its meshes, and its own material.
 * @param scene Scene the object was built in.
 * @param sceneObjectId Scene object ID to remove any existing entity for.
 * @param gizmoManager Gizmo manager to remove the object's meshes from.
 */
export function disposeSceneObjectNode(
  scene: Scene,
  sceneObjectId: string,
  gizmoManager: GizmoManager
): void {
  const node = getSceneObjectTransformNode(scene, sceneObjectId);
  if (gizmoManager.attachedNode === node) {
    gizmoManager.attachToNode(null);
  }

  if (node) {
    stopNodePoseInterpolation(node);
    const scaleNode = getSceneObjectScaleNode(scene, sceneObjectId);
    if (scaleNode) stopNodePoseInterpolation(scaleNode);
  }
  disposeCollisionBody(scene, sceneObjectId, "object");
  // `true` for `disposeMaterialAndTextures`, unlike probes: the flag propagates to every
  // child mesh, and the object's `StandardMaterial` belongs to it alone.
  node?.dispose(false, true);
  gizmoManager.attachableMeshes = (gizmoManager.attachableMeshes ?? []).filter(
    mesh => !mesh.name.startsWith(sceneObjectId)
  );
}

/** Do two scale triples match, treating a missing one as no match. */
function isSameScale(
  cooked: [number, number, number] | undefined,
  scale: [number, number, number]
): boolean {
  return !!cooked && cooked.every((value, index) => value === scale[index]);
}

/**
 * Synchronize the scene object entities with their states, building,
 * recoloring, repositioning, rescaling, and disposing them as needed.
 * @param scene Scene holding the scene object entities.
 * @param experiment Experiment whose scene objects to sync.
 * @param gizmoManager Gizmo manager to add fresh objects' meshes to.
 * @param state Load bookkeeping, mutated in place.
 * @param draggedSceneObjectId Scene object id currently under a gizmo drag, skipped for pose updates.
 * @param loadModel Loader for a scene object's stored model file, by model id.
 */
export async function syncSceneObjects(
  scene: Scene,
  experiment: Experiment,
  gizmoManager: GizmoManager,
  state: SceneObjectSyncState,
  draggedSceneObjectId: string | null,
  loadModel: (modelId: string) => Promise<File | null>
): Promise<{
  failedIds: string[];
  colliderFailedIds: string[];
  colliderChangedIds: string[];
}> {
  const atlasRootNode = buildAtlasRootNode(scene);
  const sceneObjectsById = new Map(
    experiment.sceneObjects.map(sceneObject => [sceneObject.id, sceneObject])
  );

  for (const node of atlasRootNode.getChildren(child =>
    child.name.endsWith(SCENE_OBJECT_NODE_SUFFIX)
  ) as TransformNode[]) {
    const id = sceneEntityIdFromName(node.name, "object");
    if (!sceneObjectsById.has(id))
      disposeSceneObjectNode(scene, id, gizmoManager);
  }
  for (const id of state.failedIds) {
    if (!sceneObjectsById.has(id)) state.failedIds.delete(id);
  }
  for (const id of state.loadingIds) {
    if (!sceneObjectsById.has(id)) state.loadingIds.delete(id);
  }
  for (const id of state.colliderFailedIds) {
    if (!sceneObjectsById.has(id)) state.colliderFailedIds.delete(id);
  }
  for (const id of state.colliderScales.keys()) {
    if (!sceneObjectsById.has(id)) state.colliderScales.delete(id);
  }

  const failedIds: string[] = [];
  const colliderFailedIds: string[] = [];
  // Ids whose collider was disposed this pass (turned off, or re-cooked for a
  // new scale). Havok emits no TRIGGER_EXITED when a body is disposed while
  // overlapping, so the caller must force-drop any stale pair for these ids.
  const colliderChangedIds: string[] = [];
  for (const sceneObject of experiment.sceneObjects) {
    let node = getSceneObjectTransformNode(scene, sceneObject.id);
    const isFresh = !node;
    if (!node) {
      if (
        state.loadingIds.has(sceneObject.id) ||
        state.failedIds.has(sceneObject.id)
      ) {
        continue;
      }
      state.loadingIds.add(sceneObject.id);
      try {
        const modelFile = await loadModel(sceneObject.modelId);
        const built = modelFile
          ? await buildSceneObjectNode(
              scene,
              sceneObject,
              modelFile,
              gizmoManager
            )
          : null;
        node = built?.node ?? null;
        if (built && sceneObject.collidable && !built.colliderFailed) {
          state.colliderScales.set(sceneObject.id, [...sceneObject.scale]);
        }
        if (built?.colliderFailed) {
          state.colliderFailedIds.add(sceneObject.id);
          colliderFailedIds.push(sceneObject.id);
        }
      } catch {
        node = null;
      } finally {
        state.loadingIds.delete(sceneObject.id);
      }
      // The scene can be torn down while a model loads.
      if (scene.isDisposed) {
        return { failedIds, colliderFailedIds, colliderChangedIds };
      }
      if (!node) {
        state.failedIds.add(sceneObject.id);
        failedIds.push(sceneObject.id);
        continue;
      }
    }

    const meshes = getSceneObjectMeshes(scene, sceneObject.id);
    const scaleNode = buildSceneObjectScaleNode(node, sceneObject.id);

    const material = scene.getMaterialByName(
      buildSceneEntityName(sceneObject.id, "object", "material")
    );
    if (material instanceof StandardMaterial) {
      setMaterialDiffuseColor(
        material,
        Color3.FromHexString(sceneObject.color)
      );
    }
    // The collider node is a sibling of the meshes, so a hidden object still collides.
    for (const mesh of meshes) {
      mesh.setEnabled(sceneObject.visibility === "visible");
    }

    // Skip pose and collider updates for the object being dragged: a
    // scale-gizmo drag must not re-cook the collider every frame. Once
    // `endSceneObjectDrag` clears `draggedSceneObjectId`, this watcher
    // re-runs and the collider re-cooks once at the released scale.
    if (sceneObject.id === draggedSceneObjectId) continue;

    const hasCollider = !!scene.getTransformNodeByName(
      buildSceneEntityName(sceneObject.id, "object", "collider")
    );
    if (!sceneObject.collidable) {
      state.colliderFailedIds.delete(sceneObject.id);
      state.colliderScales.delete(sceneObject.id);
      if (hasCollider) {
        disposeCollisionBody(scene, sceneObject.id, "object");
        colliderChangedIds.push(sceneObject.id);
      }
    } else if (
      meshes.length &&
      !state.colliderFailedIds.has(sceneObject.id) &&
      !isSameScale(state.colliderScales.get(sceneObject.id), sceneObject.scale)
    ) {
      if (hasCollider) {
        disposeCollisionBody(scene, sceneObject.id, "object");
        colliderChangedIds.push(sceneObject.id);
      }
      try {
        buildSceneObjectCollider(
          scene,
          node,
          scaleNode,
          sceneObject.id,
          meshes,
          asrToVector3(sceneObject.scale)
        );
        state.colliderScales.set(sceneObject.id, [...sceneObject.scale]);
      } catch {
        state.colliderFailedIds.add(sceneObject.id);
        colliderFailedIds.push(sceneObject.id);
      }
    }

    const goalPosition = asrToVector3(sceneObject.position);
    const goalRotation = asrToVector3(sceneObject.rotation);
    const goalScaling = asrToVector3(sceneObject.scale);
    if (isFresh) {
      node.position = goalPosition;
      node.rotation = goalRotation;
      scaleNode.scaling = goalScaling;
      continue;
    }
    if (
      node.position.equals(goalPosition) &&
      node.rotation.equals(goalRotation) &&
      scaleNode.scaling.equals(goalScaling)
    ) {
      continue;
    }
    interpolateNodePose(scene, node, {
      position: goalPosition,
      rotation: goalRotation,
      scaling: Vector3.One()
    });
    interpolateNodePose(scene, scaleNode, {
      position: Vector3.Zero(),
      rotation: Vector3.Zero(),
      scaling: goalScaling
    });
  }
  return { failedIds, colliderFailedIds, colliderChangedIds };
}

/**
 * Attach the gizmo to a scene object's transform node and select its meshes,
 * leaving a locked object outlined but without a gizmo.
 * @param gizmoManager Gizmo manager to attach to the object's transform node.
 * @param selectionOutlineLayer Selection outline layer to add the object's meshes to.
 * @param sceneObject Scene object being selected, whose lock decides whether a gizmo attaches.
 * @param sceneObjectTransformNode Scene object transform node to attach and select.
 */
export function attachSceneObjectSelection(
  gizmoManager: GizmoManager,
  selectionOutlineLayer: SelectionOutlineLayer,
  sceneObject: SceneObject,
  sceneObjectTransformNode: TransformNode
): void {
  gizmoManager.attachToNode(sceneObject.lock ? null : sceneObjectTransformNode);
  selectionOutlineLayer.clearSelection();
  selectionOutlineLayer.addSelection(
    sceneObjectTransformNode
      .getChildMeshes()
      .filter(mesh => mesh.getTotalVertices() > 0)
  );
}

/**
 * Select a scene object in the scene based on the Gizmo's pick.
 * @param scene Scene with scene objects.
 * @param gizmoManager Gizmo manager to update.
 * @param selectionOutlineLayer Selection outline layer to add the object to selection.
 * @param sceneObjects Experiment scene objects to resolve the attached mesh against.
 * @param onSelect Callback invoked with the scene object whose mesh was attached to.
 */
export function selectSceneObjectFromGizmoAttach(
  scene: Scene,
  gizmoManager: GizmoManager,
  selectionOutlineLayer: SelectionOutlineLayer,
  sceneObjects: SceneObject[],
  onSelect: (sceneObject: SceneObject) => void
): Observer<Nullable<AbstractMesh>> {
  return gizmoManager.onAttachedToMeshObservable.add(mesh => {
    if (!mesh) return;
    if (!isSceneEntityName(mesh.name, "object")) return;

    const sceneObjectId = sceneEntityIdFromName(mesh.name, "object");
    const sceneObjectTransformNode = getSceneObjectTransformNode(
      scene,
      sceneObjectId
    );
    if (!sceneObjectTransformNode) return;

    const sceneObject = sceneObjects.find(
      sceneObject => sceneObject.id === sceneObjectId
    );
    if (!sceneObject) return;

    attachSceneObjectSelection(
      gizmoManager,
      selectionOutlineLayer,
      sceneObject,
      sceneObjectTransformNode
    );
    onSelect(sceneObject);
  });
}

/**
 * Resolve the scene object and transform node currently attached to the
 * gizmo, or null if nothing (or a non-scene-object entity) is attached.
 * @param gizmo Gizmo to read the attached node from.
 * @param sceneObjects Experiment scene objects to resolve the attached mesh against.
 */
function attachedSceneObjectFromGizmo(
  gizmo: IGizmo,
  sceneObjects: SceneObject[]
): { sceneObject: SceneObject; node: TransformNode } | null {
  const node = gizmo.attachedNode;
  if (!node || !isSceneEntityName(node.name, "object")) return null;

  const sceneObjectId = sceneEntityIdFromName(node.name, "object");
  const sceneObject = sceneObjects.find(
    sceneObject => sceneObject.id === sceneObjectId
  );
  if (!sceneObject) return null;

  return { sceneObject, node: node as TransformNode };
}

/**
 * Update a scene object's position from a gizmo drag.
 * @param positionGizmo Position gizmo to track dragging on.
 * @param sceneObjects Experiment scene objects to resolve the attached mesh against.
 * @param onDrag Callback invoked with the scene object id the drag is happening to.
 */
export function setSceneObjectPositionFromGizmoDrag(
  positionGizmo: IPositionGizmo,
  sceneObjects: SceneObject[],
  onDrag: (sceneObjectId: string) => void
): Observer<DragEvent> {
  return positionGizmo.onDragObservable.add(() => {
    const attached = attachedSceneObjectFromGizmo(positionGizmo, sceneObjects);
    if (!attached) return;
    stopNodePoseInterpolation(attached.node);
    attached.sceneObject.position = vector3ToAsr(attached.node.position);
    onDrag(attached.sceneObject.id);
  });
}

/**
 * Update a scene object's orientation from a gizmo drag.
 * @param rotationGizmo Rotation gizmo to track dragging on.
 * @param sceneObjects Experiment scene objects to resolve the attached mesh against.
 * @param onDrag Callback invoked with the scene object id the drag is happening to.
 */
export function setSceneObjectRotationFromGizmoDrag(
  rotationGizmo: IRotationGizmo,
  sceneObjects: SceneObject[],
  onDrag: (sceneObjectId: string) => void
): Observer<DragEvent> {
  return rotationGizmo.onDragObservable.add(() => {
    const attached = attachedSceneObjectFromGizmo(rotationGizmo, sceneObjects);
    if (!attached) return;
    stopNodePoseInterpolation(attached.node);
    attached.sceneObject.rotation = vector3ToAsr(attached.node.rotation);
    onDrag(attached.sceneObject.id);
  });
}

/**
 * Update a scene object's scale from a gizmo drag.
 * @param scaleGizmo Scale gizmo to track dragging on.
 * @param sceneObjects Experiment scene objects to resolve the attached mesh against.
 * @param onDrag Callback invoked with the scene object id the drag is happening to.
 */
export function setSceneObjectScaleFromGizmoDrag(
  scaleGizmo: IScaleGizmo,
  sceneObjects: SceneObject[],
  onDrag: (sceneObjectId: string) => void
): Observer<DragEvent> {
  return scaleGizmo.onDragObservable.add(() => {
    const attached = attachedSceneObjectFromGizmo(scaleGizmo, sceneObjects);
    if (!attached) return;
    const scaleNode = buildSceneObjectScaleNode(
      attached.node,
      attached.sceneObject.id
    );
    stopNodePoseInterpolation(attached.node);
    stopNodePoseInterpolation(scaleNode);
    // The gizmo scales the node it is attached to; the scale belongs on the
    // child so the object node stays unscaled and the rotation gizmo keeps
    // working in local space.
    scaleNode.scaling.multiplyInPlace(attached.node.scaling);
    attached.node.scaling.setAll(1);
    attached.sceneObject.scale = vector3ToAsr(scaleNode.scaling);
    onDrag(attached.sceneObject.id);
  });
}

/**
 * Callback filter for when dragging finishes on a scene object, from the
 * position, rotation, or scale gizmo.
 * @param gizmos Position, rotation, and scale gizmos to track dragging on.
 * @param onDragEnd Callback invoked to confirm the scene object drag ended.
 */
export function endSceneObjectGizmoDrag(
  gizmos: TransformGizmos,
  onDragEnd: () => void
): Observer<DragStartEndEvent>[] {
  const onEnd = (gizmo: IGizmo) => () => {
    if (!gizmo.attachedNode) return;
    if (!isSceneEntityName(gizmo.attachedNode.name, "object")) return;
    onDragEnd();
  };

  return [
    gizmos.positionGizmo.onDragEndObservable.add(onEnd(gizmos.positionGizmo)),
    gizmos.rotationGizmo.onDragEndObservable.add(onEnd(gizmos.rotationGizmo)),
    gizmos.scaleGizmo.onDragEndObservable.add(onEnd(gizmos.scaleGizmo))
  ];
}
