import type { Observer, Scene, TransformNode } from "@babylonjs/core";
import { Quaternion, Vector3 } from "@babylonjs/core";

/** Position, orientation, and scale a node is interpolated between. */
export interface NodePose {
  position: Vector3;
  rotation: Quaternion;
  scaling: Vector3;
}

/**
 * How far a node's orientation may sit from a goal and still count as already
 * there. Decomposing a quaternion into a rotation triple and recomposing it,
 * as a gizmo readback and the next sync do, runs through Babylon's 32-bit
 * matrices, so it only agrees to about a millionth of a radian - which is
 * thousands of times finer than a pixel of a turn.
 */
export const POSE_ROTATION_EPSILON = 1e-6;

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
    existing.start.rotation.copyFrom(nodeRotation(node));
    existing.start.scaling.copyFrom(node.scaling);
    existing.goal.position.copyFrom(goal.position);
    existing.goal.rotation.copyFrom(goal.rotation);
    existing.goal.scaling.copyFrom(goal.scaling);
    existing.elapsedSeconds = 0;
    return;
  }

  const interpolation: NodeInterpolation = {
    start: {
      position: node.position.clone(),
      rotation: nodeRotation(node).clone(),
      scaling: node.scaling.clone()
    },
    goal: {
      position: goal.position.clone(),
      rotation: goal.rotation.clone(),
      scaling: goal.scaling.clone()
    },
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
      nodeRotation(node).copyFrom(interpolation.goal.rotation);
      node.scaling.copyFrom(interpolation.goal.scaling);
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
    Vector3.LerpToRef(
      interpolation.start.scaling,
      interpolation.goal.scaling,
      amount,
      node.scaling
    );
    // Slerp the orientation: a component-wise lerp of two quaternions leaves
    // the axis of rotation drifting through the turn.
    Quaternion.SlerpToRef(
      interpolation.start.rotation,
      interpolation.goal.rotation,
      amount,
      nodeRotation(node)
    ).normalize();
  });
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

/**
 * Quaternion a node's orientation is driven by, converting a node that still
 * carries Euler angles so an interpolation always writes one representation.
 * @param node Node whose orientation to read.
 */
function nodeRotation(node: TransformNode): Quaternion {
  node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
  return node.rotationQuaternion;
}
