// Deep-import to avoid the side-effectful root barrel, which would drag the whole Babylon engine into this solver's worker chunk.
import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { getCoordinateSystemAxisValue } from "./coordinate-system.api";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { CoordinateSystemNode } from "../model/coordinate-system.model";

/** A solved coordinate system chain, in atlas ASR millimeters and radians. */
export interface CoordinateSystemSolution {
  /** Probe tip, in atlas ASR mm as [ap, dv, ml]. */
  tipPosition: [number, number, number];
  /** Probe rotation as [roll, yaw, pitch], in radians. */
  rotation: [number, number, number];
  /** Each node's solved origin, in atlas ASR mm, index-aligned with the chain. */
  nodePositions: [number, number, number][];
}

/**
 * Solve a transform chain into a probe pose, in atlas ASR millimeters.
 * @param chain Transform chain, applied in order.
 * @param referenceOffsetMillimeters Root translation in atlas ASR mm, or null for the atlas origin.
 */
export function solveCoordinateSystemChain(
  chain: CoordinateSystemNode[],
  referenceOffsetMillimeters: [number, number, number] | null
): CoordinateSystemSolution {
  const [offsetAp, offsetDv, offsetMl] = referenceOffsetMillimeters ?? [
    0, 0, 0
  ];
  let frame = Matrix.Translation(offsetMl, offsetDv, offsetAp);
  const nodePositions: [number, number, number][] = [];

  for (const node of chain) {
    const rotation = Matrix.RotationYawPitchRoll(
      getCoordinateSystemAxisValue(node, "rotation", 1),
      getCoordinateSystemAxisValue(node, "rotation", 0),
      getCoordinateSystemAxisValue(node, "rotation", 2)
    );
    const translation = Matrix.Translation(
      getCoordinateSystemAxisValue(node, "position", 0),
      getCoordinateSystemAxisValue(node, "position", 1),
      getCoordinateSystemAxisValue(node, "position", 2)
    );
    // Rotate within the node's own frame, translate in its parent's: a child's
    // translation must be carried by every rotation above it in the chain.
    frame = rotation.multiply(translation).multiply(frame);
    nodePositions.push(vector3ToAsr(frame.getTranslation()));
  }

  const euler = Quaternion.FromRotationMatrix(
    frame.getRotationMatrix()
  ).toEulerAngles();
  return {
    tipPosition: vector3ToAsr(frame.getTranslation()),
    rotation: vector3ToAsr(euler),
    nodePositions
  };
}

/**
 * Does a solved chain reproduce a probe pose within a tolerance, comparing orientation as a
 * rotation matrix so equivalent Euler branches count as equal.
 * @param solution Solved chain to compare.
 * @param tipPosition Probe tip to compare against, in atlas ASR mm as [ap, dv, ml].
 * @param rotation Probe rotation to compare against as [roll, yaw, pitch], in radians.
 * @param tolerance Largest position (mm) or rotation-matrix element difference treated as equal.
 */
export function isCoordinateSystemSolutionAtPose(
  solution: CoordinateSystemSolution,
  tipPosition: [number, number, number],
  rotation: [number, number, number],
  tolerance: number
): boolean {
  const positionMatches = tipPosition.every(
    (value, index) =>
      Math.abs(value - solution.tipPosition[index]!) <= tolerance
  );
  if (!positionMatches) {
    return false;
  }

  const targetRotationMatrix = Matrix.RotationYawPitchRoll(
    rotation[1],
    rotation[2],
    rotation[0]
  );
  const solutionRotationMatrix = Matrix.RotationYawPitchRoll(
    solution.rotation[1],
    solution.rotation[2],
    solution.rotation[0]
  );
  return targetRotationMatrix.m.every(
    (value, index) =>
      Math.abs(value - solutionRotationMatrix.m[index]!) <= tolerance
  );
}

/**
 * Axis swap a Babylon vector (ML, DV, AP) back into an atlas ASR triple.
 * @param vector Babylon vector to convert.
 */
function vector3ToAsr(vector: Vector3): [number, number, number] {
  return [vector.z, vector.y, vector.x];
}
