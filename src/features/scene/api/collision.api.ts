import type {
  HavokPlugin,
  HighlightLayer,
  IBasePhysicsCollisionEvent,
  Mesh,
  Observer,
  PhysicsShape,
  Scene
} from "@babylonjs/core";
import {
  Color3,
  PhysicsBody,
  PhysicsEventType,
  PhysicsMotionType,
  PhysicsShapeContainer,
  Quaternion,
  TransformNode
} from "@babylonjs/core";
import type { SceneEntityKind } from "../models/scene-entity.model";
import {
  buildSceneEntityName,
  sceneEntityFromColliderName
} from "./scene-entity.api";

/** Overlap bookkeeping for scene entity trigger events. */
export interface CollisionState {
  /** Overlapping child-shape pair count, keyed by `${lowerEntityId}|${higherEntityId}`. */
  pairCounts: Map<string, number>;
}

/** An entity pair that started or stopped overlapping, with ids sorted ascending. */
export interface CollisionChange {
  kind: "entered" | "exited";
  entityIds: [string, string];
}

/** Child shapes of an entity's container shape, kept for disposal. */
interface ColliderMetadata {
  shapes: PhysicsShape[];
}

/**
 * Build an entity's animated trigger body under its transform node, or null when the
 * scene has no physics engine.
 * @param entityTransformNode Entity transform node to parent the body's node to.
 * @param entityId Entity id the body belongs to.
 * @param kind Entity kind, naming the collider node.
 * @param buildShapes Lazily builds the trigger shapes to add, each with the mesh whose local
 * transform places it. Not called when the scene has no physics engine, so a caller's physics
 * shape construction (which throws without one) never runs needlessly.
 */
export function buildCollisionBody(
  entityTransformNode: TransformNode,
  entityId: string,
  kind: SceneEntityKind,
  buildShapes: () => { shape: PhysicsShape; mesh: Mesh }[]
): PhysicsBody | null {
  const scene = entityTransformNode.getScene();
  if (!scene.getPhysicsEngine()) return null;

  const colliderNode = new TransformNode(
    buildSceneEntityName(entityId, kind, "collider"),
    scene
  );
  colliderNode.parent = entityTransformNode;

  const shapes = buildShapes();
  const container = new PhysicsShapeContainer(scene);
  for (const { shape, mesh } of shapes) {
    shape.isTrigger = true;
    container.addChild(
      shape,
      mesh.position,
      mesh.rotationQuaternion ?? Quaternion.FromEulerVector(mesh.rotation),
      mesh.scaling
    );
  }

  const metadata: ColliderMetadata = {
    shapes: shapes.map(({ shape }) => shape)
  };
  colliderNode.metadata = metadata;

  const body = new PhysicsBody(
    colliderNode,
    PhysicsMotionType.ANIMATED,
    false,
    scene
  );
  body.shape = container;
  // Entities move by gizmo drag and direct position setting, so the body must read its node's
  // transform every step; Babylon defaults this off.
  body.disablePreStep = false;
  // The node is driven entirely by its parent entity node - never let Havok write back to it.
  body.disableSync = true;

  return body;
}

/**
 * Dispose an entity's physics body, its shapes, and its collider node.
 * @param scene Scene the entity's collider was built in.
 * @param entityId Entity id whose collider to dispose.
 * @param kind Entity kind, naming the collider node.
 */
export function disposeCollisionBody(
  scene: Scene,
  entityId: string,
  kind: SceneEntityKind
): void {
  const colliderNode = scene.getTransformNodeByName(
    buildSceneEntityName(entityId, kind, "collider")
  );
  if (!colliderNode) return;

  const container = colliderNode.physicsBody?.shape ?? null;
  const metadata = colliderNode.metadata as ColliderMetadata | null;

  colliderNode.physicsBody?.dispose();
  container?.dispose();
  for (const shape of metadata?.shapes ?? []) {
    shape.dispose();
  }
  colliderNode.dispose();
}

/** Build empty scene entity collision bookkeeping. */
export function createCollisionState(): CollisionState {
  return { pairCounts: new Map() };
}

/**
 * Subscribe to the plugin's trigger events and report per-entity-pair overlap transitions.
 * @param plugin Havok plugin to observe trigger collisions on.
 * @param state Collision bookkeeping to update in place.
 * @param onChange Callback invoked when an entity pair starts or stops overlapping.
 */
export function trackCollisions(
  plugin: HavokPlugin,
  state: CollisionState,
  onChange: (change: CollisionChange) => void
): Observer<IBasePhysicsCollisionEvent> {
  return plugin.onTriggerCollisionObservable.add(event => {
    const collider = sceneEntityFromColliderName(
      event.collider.transformNode.name
    );
    const collidedAgainst = sceneEntityFromColliderName(
      event.collidedAgainst.transformNode.name
    );
    if (!collider || !collidedAgainst) return;

    const entityIds: [string, string] =
      collider.id < collidedAgainst.id
        ? [collider.id, collidedAgainst.id]
        : [collidedAgainst.id, collider.id];
    const key = entityIds.join("|");
    const delta = event.type === PhysicsEventType.TRIGGER_ENTERED ? 1 : -1;
    const count = (state.pairCounts.get(key) ?? 0) + delta;

    if (count <= 0) {
      state.pairCounts.delete(key);
    } else {
      state.pairCounts.set(key, count);
    }

    if (delta === 1 && count === 1) {
      onChange({ kind: "entered", entityIds });
    } else if (delta === -1 && count === 0) {
      onChange({ kind: "exited", entityIds });
    }
  });
}

/**
 * Add or remove an entity's meshes from the highlight layer, red while it overlaps another entity.
 * @param highlightLayer Highlight layer to update.
 * @param state Collision bookkeeping to read the entity's overlaps from.
 * @param entityId Entity id whose highlight to refresh.
 * @param entityMeshes Entity's meshes to highlight or un-highlight.
 */
export function syncCollisionHighlight(
  highlightLayer: HighlightLayer,
  state: CollisionState,
  entityId: string,
  entityMeshes: Mesh[]
): void {
  const isColliding = [...state.pairCounts.keys()].some(key =>
    key.split("|").includes(entityId)
  );

  for (const mesh of entityMeshes) {
    if (isColliding) {
      highlightLayer.addMesh(mesh, Color3.Red());
    } else {
      highlightLayer.removeMesh(mesh);
    }
  }
}

/**
 * Drop overlaps involving entities whose bodies no longer exist, returning the surviving entity ids
 * that need their highlight refreshed.
 * @param state Collision bookkeeping to prune in place.
 * @param keptEntityIds Entity ids whose bodies survived this sync.
 */
export function pruneCollisions(
  state: CollisionState,
  keptEntityIds: string[]
): string[] {
  const keptIds = new Set(keptEntityIds);
  const affectedSurvivingIds = new Set<string>();

  for (const key of state.pairCounts.keys()) {
    const [firstId, secondId] = key.split("|") as [string, string];
    if (keptIds.has(firstId) && keptIds.has(secondId)) continue;

    state.pairCounts.delete(key);
    if (keptIds.has(firstId)) affectedSurvivingIds.add(firstId);
    if (keptIds.has(secondId)) affectedSurvivingIds.add(secondId);
  }

  return [...affectedSurvivingIds];
}
