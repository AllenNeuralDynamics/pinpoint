import type {
  HavokPlugin,
  IBasePhysicsCollisionEvent,
  Mesh,
  Observer,
  PhysicsShape,
  Scene,
  HighlightLayer
} from "@babylonjs/core";
import {
  Color3,
  PhysicsBody,
  PhysicsEventType,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  PhysicsShapeConvexHull,
  Quaternion,
  TransformNode
} from "@babylonjs/core";

/** Overlap bookkeeping for probe trigger events. */
export interface ProbeCollisionState {
  /** Overlapping child-shape pair count, keyed by `${lowerProbeId}|${higherProbeId}`. */
  pairCounts: Map<string, number>;
}

/** A probe pair that started or stopped overlapping, with ids sorted ascending. */
export interface ProbeCollisionChange {
  kind: "entered" | "exited";
  probeIds: [string, string];
}

/** Child shapes of a probe's container shape, kept for disposal. */
interface ProbeColliderMetadata {
  shapes: PhysicsShape[];
}

/** Suffix applied to a probe's id to name the transform node carrying its physics body. */
const PROBE_COLLIDER_SUFFIX = "_probe_collider";

/**
 * Build a probe's animated trigger body under its transform node, or null when the scene has no
 * physics engine.
 * @param probeTransformNode Probe transform node to parent the body's node to.
 * @param probeId Probe id the body belongs to.
 * @param hullMeshes Meshes to bound with convex hulls (rod, head stage).
 * @param boxMesh Mesh to bound with an axis-aligned box (shanks).
 */
export function buildProbeCollisionBody(
  probeTransformNode: TransformNode,
  probeId: string,
  hullMeshes: Mesh[],
  boxMesh: Mesh
): PhysicsBody | null {
  const scene = probeTransformNode.getScene();
  if (!scene.getPhysicsEngine()) return null;

  const colliderNode = new TransformNode(
    `${probeId}${PROBE_COLLIDER_SUFFIX}`,
    scene
  );
  colliderNode.parent = probeTransformNode;

  const container = new PhysicsShapeContainer(scene);
  const shapes: PhysicsShape[] = [];
  for (const mesh of hullMeshes) {
    shapes.push(new PhysicsShapeConvexHull(mesh, scene));
  }
  shapes.push(PhysicsShapeBox.FromMesh(boxMesh));

  const meshesByShapeOrder = [...hullMeshes, boxMesh];
  for (const [index, shape] of shapes.entries()) {
    shape.isTrigger = true;
    const mesh = meshesByShapeOrder[index]!;
    container.addChild(
      shape,
      mesh.position,
      mesh.rotationQuaternion ?? Quaternion.FromEulerVector(mesh.rotation),
      mesh.scaling
    );
  }

  const metadata: ProbeColliderMetadata = { shapes };
  colliderNode.metadata = metadata;

  const body = new PhysicsBody(
    colliderNode,
    PhysicsMotionType.ANIMATED,
    false,
    scene
  );
  body.shape = container;
  // Probes move by gizmo drag and direct position setting, so the body must read its node's
  // transform every step; Babylon defaults this off.
  body.disablePreStep = false;
  // The node is driven entirely by its parent probe node - never let Havok write back to it.
  body.disableSync = true;

  return body;
}

/**
 * Dispose a probe's physics body, its shapes, and its collider node.
 * @param scene Scene the probe's collider was built in.
 * @param probeId Probe id whose collider to dispose.
 */
export function disposeProbeCollisionBody(scene: Scene, probeId: string): void {
  const colliderNode = scene.getTransformNodeByName(
    `${probeId}${PROBE_COLLIDER_SUFFIX}`
  );
  if (!colliderNode) return;

  const container = colliderNode.physicsBody?.shape ?? null;
  const metadata = colliderNode.metadata as ProbeColliderMetadata | null;

  colliderNode.physicsBody?.dispose();
  container?.dispose();
  for (const shape of metadata?.shapes ?? []) {
    shape.dispose();
  }
  colliderNode.dispose();
}

/** Build empty probe collision bookkeeping. */
export function createProbeCollisionState(): ProbeCollisionState {
  return { pairCounts: new Map() };
}

/**
 * Subscribe to the plugin's trigger events and report per-probe-pair overlap transitions.
 * @param plugin Havok plugin to observe trigger collisions on.
 * @param state Collision bookkeeping to update in place.
 * @param onChange Callback invoked when a probe pair starts or stops overlapping.
 */
export function trackProbeCollisions(
  plugin: HavokPlugin,
  state: ProbeCollisionState,
  onChange: (change: ProbeCollisionChange) => void
): Observer<IBasePhysicsCollisionEvent> {
  return plugin.onTriggerCollisionObservable.add(event => {
    const colliderName = event.collider.transformNode.name;
    const collidedAgainstName = event.collidedAgainst.transformNode.name;
    if (
      !colliderName.endsWith(PROBE_COLLIDER_SUFFIX) ||
      !collidedAgainstName.endsWith(PROBE_COLLIDER_SUFFIX)
    ) {
      return;
    }

    const colliderId = colliderName.slice(0, -PROBE_COLLIDER_SUFFIX.length);
    const collidedAgainstId = collidedAgainstName.slice(
      0,
      -PROBE_COLLIDER_SUFFIX.length
    );
    const probeIds: [string, string] =
      colliderId < collidedAgainstId
        ? [colliderId, collidedAgainstId]
        : [collidedAgainstId, colliderId];
    const key = probeIds.join("|");
    const delta = event.type === PhysicsEventType.TRIGGER_ENTERED ? 1 : -1;
    const count = (state.pairCounts.get(key) ?? 0) + delta;

    if (count <= 0) {
      state.pairCounts.delete(key);
    } else {
      state.pairCounts.set(key, count);
    }

    if (delta === 1 && count === 1) {
      onChange({ kind: "entered", probeIds });
    } else if (delta === -1 && count === 0) {
      onChange({ kind: "exited", probeIds });
    }
  });
}

/**
 * Add or remove a probe's meshes from the highlight layer, red while it overlaps another probe.
 * @param highlightLayer Highlight layer to update.
 * @param state Collision bookkeeping to read the probe's overlaps from.
 * @param probeId Probe id whose highlight to refresh.
 * @param probeMeshes Probe's meshes to highlight or un-highlight.
 */
export function syncProbeCollisionHighlight(
  highlightLayer: HighlightLayer,
  state: ProbeCollisionState,
  probeId: string,
  probeMeshes: Mesh[]
): void {
  const isColliding = [...state.pairCounts.keys()].some(key =>
    key.split("|").includes(probeId)
  );

  for (const mesh of probeMeshes) {
    if (isColliding) {
      highlightLayer.addMesh(mesh, Color3.Red());
    } else {
      highlightLayer.removeMesh(mesh);
    }
  }
}

/**
 * Drop overlaps involving probes whose bodies no longer exist, returning the surviving probe ids
 * that need their highlight refreshed.
 * @param state Collision bookkeeping to prune in place.
 * @param keptProbeIds Probe ids whose bodies survived this sync.
 */
export function pruneProbeCollisions(
  state: ProbeCollisionState,
  keptProbeIds: string[]
): string[] {
  const keptIds = new Set(keptProbeIds);
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
