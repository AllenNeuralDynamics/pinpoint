import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { CoordinateSystem } from "../model/coordinate-system.model";
import type { CoordinateSystemSolution } from "./forward-kinematics.api";
import { getCoordinateSystemAxisValue } from "./coordinate-system.api";

/**
 * Map native atlas coordinates into the fixed root's display frame, retaining the reference origin.
 * @param coordinateSystem Coordinate system whose root defines the frame, or null for identity.
 * @param referenceCoordinate Experiment reference origin in ASR millimeters.
 */
export function getCoordinateSystemBrainTransform(
  coordinateSystem: CoordinateSystem | null,
  referenceCoordinate: [number, number, number] | null
): Matrix {
  if (!coordinateSystem) return Matrix.Identity();
  const root = coordinateSystem.brainTransform;
  const [ap, dv, ml] = coordinateSystem.offsetByReferenceCoordinate
    ? (referenceCoordinate ?? [0, 0, 0])
    : [0, 0, 0];
  const frame = Matrix.RotationYawPitchRoll(
    getCoordinateSystemAxisValue(root, "rotation", 1),
    getCoordinateSystemAxisValue(root, "rotation", 0),
    getCoordinateSystemAxisValue(root, "rotation", 2)
  ).multiply(
    Matrix.Translation(
      ml + getCoordinateSystemAxisValue(root, "position", 0),
      dv + getCoordinateSystemAxisValue(root, "position", 1),
      ap + getCoordinateSystemAxisValue(root, "position", 2)
    )
  );
  return frame.invert().multiply(Matrix.Translation(ml, dv, ap));
}

/**
 * Express a pose in another rigid frame, preserving all three orientation axes.
 * @param pose Pose in ASR millimeters and roll/yaw/pitch radians.
 * @param frame Matrix mapping the pose's current XYZ frame to its destination.
 */
export function transformCoordinateSystemPose(
  pose: Pick<CoordinateSystemSolution, "tipPosition" | "rotation">,
  frame: Matrix
): Pick<CoordinateSystemSolution, "tipPosition" | "rotation"> {
  const [ap, dv, ml] = pose.tipPosition;
  const [roll, yaw, pitch] = pose.rotation;
  const matrix = Matrix.RotationYawPitchRoll(yaw, pitch, roll)
    .multiply(Matrix.Translation(ml, dv, ap))
    .multiply(frame);
  const position = Vector3.Zero();
  const quaternion = Quaternion.Identity();
  matrix.decompose(undefined, quaternion, position);
  const rotation = quaternion.toEulerAngles();
  return {
    tipPosition: [position.z, position.y, position.x],
    rotation: [rotation.z, rotation.y, rotation.x]
  };
}
