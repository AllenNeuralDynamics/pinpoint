import type { Observer, Scene, TransformNode } from "@babylonjs/core";
import { Quaternion, TmpVectors, Vector3 } from "@babylonjs/core";

/** Position and Euler rotation a node is interpolated between. */
export interface NodePose {
  position: Vector3;
  rotation: Vector3;
}

/** Duration of a pose interpolation, in seconds. */
const DURATION_SECONDS = 0.2;

/** In-flight interpolation of one node between two poses. */
interface NodeInterpolation {
  start: NodePose;
  goal: NodePose;
  elapsedSeconds: number;
  observer: Observer<Scene> | null;
}

const interpolations = new WeakMap<TransformNode, NodeInterpolation>();

/**
 * Start a fire-and-forget interpolation of a node to a goal pose, or restart
 * the one already running on it from the node's current pose.
 * @param scene Scene whose frames drive the interpolation.
 * @param node Node to move.
 * @param goal Pose to interpolate the node to.
 */
export function interpolateNodePose(
  scene: Scene,
  node: TransformNode,
  goal: NodePose
): void {
  const existing = interpolations.get(node);
  if (existing) {
    existing.start.position.copyFrom(node.position);
    existing.start.rotation.copyFrom(node.rotation);
    existing.goal.position.copyFrom(goal.position);
    existing.goal.rotation.copyFrom(goal.rotation);
    existing.elapsedSeconds = 0;
    return;
  }

  const interpolation: NodeInterpolation = {
    start: { position: node.position.clone(), rotation: node.rotation.clone() },
    goal: { position: goal.position.clone(), rotation: goal.rotation.clone() },
    elapsedSeconds: 0,
    observer: null
  };
  interpolations.set(node, interpolation);
  interpolation.observer = scene.onBeforeRenderObservable.add(() => {
    if (node.isDisposed()) {
      stopNodePoseInterpolation(node);
      return;
    }

    interpolation.elapsedSeconds += scene.getEngine().getDeltaTime() / 1000;
    if (interpolation.elapsedSeconds >= DURATION_SECONDS) {
      node.position.copyFrom(interpolation.goal.position);
      node.rotation.copyFrom(interpolation.goal.rotation);
      stopNodePoseInterpolation(node);
      return;
    }

    const progress = interpolation.elapsedSeconds / DURATION_SECONDS;
    // Smoothstep, easing in and out of the move.
    const amount = progress * progress * (3 - 2 * progress);
    Vector3.LerpToRef(
      interpolation.start.position,
      interpolation.goal.position,
      amount,
      node.position
    );
    // Slerp the orientation: an Euler lerp takes the long way round whenever
    // two angles straddle a wrap.
    Quaternion.SlerpToRef(
      Quaternion.FromEulerVectorToRef(
        interpolation.start.rotation,
        TmpVectors.Quaternion[0]
      ),
      Quaternion.FromEulerVectorToRef(
        interpolation.goal.rotation,
        TmpVectors.Quaternion[1]
      ),
      amount,
      TmpVectors.Quaternion[2]
    )
      .normalize()
      .toEulerAnglesToRef(node.rotation);
  });
}

/**
 * Is a fire-and-forget pose interpolation currently running on a node.
 * @param node Node to check.
 */
export function isNodePoseInterpolating(node: TransformNode): boolean {
  return interpolations.has(node);
}

/**
 * Stop any in-flight pose interpolation on a node, leaving its current pose.
 * @param node Node to stop interpolating.
 */
export function stopNodePoseInterpolation(node: TransformNode): void {
  const interpolation = interpolations.get(node);
  if (!interpolation) return;

  interpolation.observer?.remove();
  interpolations.delete(node);
}
