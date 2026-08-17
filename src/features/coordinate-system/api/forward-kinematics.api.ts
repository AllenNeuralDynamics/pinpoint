// Deep-import to avoid the side-effectful root barrel, which would drag the whole Babylon engine into this solver's worker chunk.
import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { getCoordinateSystemAxisValue } from "./coordinate-system.api";
import {
  ATLAS_AXIS_DIRECTIONS,
  convertCoordinate,
  getBasisMatrix,
  getChainRestRotation,
  getOrientationFromFrame,
  getOrientationInFrame,
  getRotationMatrix,
  getRotationTriple,
  multiplyMatrices,
  transformVector,
  transposeMatrix
} from "@/utils/coordinate-frame";
import type {
  AxisDirections,
  LocalCoordinateSystem,
  Matrix3
} from "@/utils/coordinate-frame";
import type { CoordinateSystemNode } from "../model/coordinate-system.model";

/**
 * Directions of the solver's own frame, which every chain value is expressed in:
 * the atlas's axes reversed, matching the frame the scene places its nodes in.
 * Derived from the atlas rather than restated, so it can never disagree about
 * which way is right, and declared here rather than taken from the scene so this
 * solver's worker chunk stays free of Babylon's engine and the scene barrel.
 */
export const SOLVER_AXIS_DIRECTIONS: AxisDirections = [
  ATLAS_AXIS_DIRECTIONS[2],
  ATLAS_AXIS_DIRECTIONS[1],
  ATLAS_AXIS_DIRECTIONS[0]
];

/** A solved coordinate system chain, in global coordinate system millimeters and radians. */
export interface CoordinateSystemSolution {
  /** Probe tip, in global coordinate system mm. */
  tipPosition: [number, number, number];
  /** Probe rotation about the global coordinate system's axes, relative to its rest orientation, in radians. */
  rotation: [number, number, number];
  /** Each node's solved origin, in global coordinate system mm, index-aligned with the chain. */
  nodePositions: [number, number, number][];
}

/**
 * Solve a transform chain into a probe pose, in global coordinate system millimeters.
 * @param chain Transform chain, applied in order.
 * @param referenceOffsetMillimeters Root translation in global coordinate system mm, or null for the atlas origin.
 * @param globalDirections Axis directions the solved pose is reported in.
 * @param localCoordinateSystem Local coordinate system the chain rests in.
 */
export function solveCoordinateSystemChain(
  chain: CoordinateSystemNode[],
  referenceOffsetMillimeters: [number, number, number] | null,
  globalDirections: AxisDirections,
  localCoordinateSystem: LocalCoordinateSystem
): CoordinateSystemSolution {
  const [offsetX, offsetY, offsetZ] = convertCoordinate(
    globalDirections,
    SOLVER_AXIS_DIRECTIONS,
    referenceOffsetMillimeters ?? [0, 0, 0]
  );
  const chainRestRotation = getChainRestRotation(localCoordinateSystem);
  // The chain starts in the probe's rest orientation, so its third axis is the
  // depth axis and its own values never have to name a rest orientation. The
  // reference offset is in the parent frame, so the rest rotation never turns it.
  let frame = getSolverMatrix(
    getOrientationInFrame(SOLVER_AXIS_DIRECTIONS, chainRestRotation)
  ).multiply(Matrix.Translation(offsetX, offsetY, offsetZ));
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
    nodePositions.push(getFrameTranslation(frame, globalDirections));
  }

  return {
    tipPosition: getFrameTranslation(frame, globalDirections),
    // The chain carries the rest orientation, and a probe's rotation is
    // rest-relative, so the rest orientation comes back off before the triple.
    rotation: getRotationTriple(
      globalDirections,
      multiplyMatrices(
        getOrientationFromFrame(
          SOLVER_AXIS_DIRECTIONS,
          getFrameOrientation(frame)
        ),
        transposeMatrix(chainRestRotation)
      )
    ),
    nodePositions
  };
}

/**
 * Does a solved chain reproduce a probe pose within a tolerance, comparing orientation as a
 * rotation matrix so equivalent rotation triples count as equal.
 * @param solution Solved chain to compare.
 * @param tipPosition Probe tip to compare against, in global coordinate system mm.
 * @param rotation Rest-relative probe rotation to compare against, in radians.
 * @param globalDirections Axis directions both rotations turn about.
 * @param tolerance Largest position (mm) or rotation-matrix element difference treated as equal.
 */
export function isCoordinateSystemSolutionAtPose(
  solution: CoordinateSystemSolution,
  tipPosition: [number, number, number],
  rotation: [number, number, number],
  globalDirections: AxisDirections,
  tolerance: number
): boolean {
  const positionMatches = tipPosition.every(
    (value, index) =>
      Math.abs(value - solution.tipPosition[index]!) <= tolerance
  );
  if (!positionMatches) {
    return false;
  }

  const targetRotation = getRotationMatrix(globalDirections, rotation);
  const solutionRotation = getRotationMatrix(
    globalDirections,
    solution.rotation
  );
  return targetRotation.every(
    (value, index) => Math.abs(value - solutionRotation[index]!) <= tolerance
  );
}

/**
 * Values one chain node takes to put a probe at a pose, which is what a chain of a single
 * all-adjustable node needs instead of a solve: it inverts `solveCoordinateSystemChain` exactly.
 * @param tipPosition Probe tip, in global coordinate system mm.
 * @param rotation Rest-relative probe rotation, in radians.
 * @param referenceOffsetMillimeters Root translation in global coordinate system mm, or null for the atlas origin.
 * @param globalDirections Axis directions the pose is expressed in.
 * @param localCoordinateSystem Local coordinate system the chain rests in.
 */
export function getCoordinateSystemNodePose(
  tipPosition: [number, number, number],
  rotation: [number, number, number],
  referenceOffsetMillimeters: [number, number, number] | null,
  globalDirections: AxisDirections,
  localCoordinateSystem: LocalCoordinateSystem
): { position: [number, number, number]; rotation: [number, number, number] } {
  const chainRestRotation = getChainRestRotation(localCoordinateSystem);
  const offset: [number, number, number] = referenceOffsetMillimeters ?? [
    0, 0, 0
  ];
  // A node translates in the chain's rest-oriented frame, so the tip's offset from the
  // reference coordinate comes back through the global basis and then the rest orientation.
  const position = transformVector(
    multiplyMatrices(
      transposeMatrix(chainRestRotation),
      getBasisMatrix(globalDirections)
    ),
    [
      tipPosition[0] - offset[0],
      tipPosition[1] - offset[1],
      tipPosition[2] - offset[2]
    ]
  );
  // The chain already rests in the probe's rest orientation, so the node turns the probe only
  // the rest of the way. `toEulerAngles` inverts the `RotationYawPitchRoll` a node composes
  // with, whose pitch, yaw, and roll are its axis 0, 1, and 2 values.
  const nodeRotation = Quaternion.FromRotationMatrix(
    getSolverMatrix(
      multiplyMatrices(
        transposeMatrix(chainRestRotation),
        multiplyMatrices(
          getRotationMatrix(globalDirections, rotation),
          chainRestRotation
        )
      )
    )
  ).toEulerAngles();
  return {
    position,
    rotation: [nodeRotation.x, nodeRotation.y, nodeRotation.z]
  };
}

/**
 * Solver-frame matrix an orientation expressed in the solver's own coordinates
 * drives, transposed because Babylon matrices multiply row vectors. Shared with
 * the inverse solver, whose goals and root frame speak the same coordinates.
 * @param orientation Orientation in the solver frame's own coordinates.
 */
export function getSolverMatrix(orientation: Matrix3): Matrix {
  return Matrix.FromValues(
    orientation[0],
    orientation[3],
    orientation[6],
    0,
    orientation[1],
    orientation[4],
    orientation[7],
    0,
    orientation[2],
    orientation[5],
    orientation[8],
    0,
    0,
    0,
    0,
    1
  );
}

/**
 * Orientation a solver-frame matrix carries, in the solver frame's own coordinates.
 * @param frame Solver-frame matrix to read.
 */
function getFrameOrientation(frame: Matrix): Matrix3 {
  const values = frame.m;
  return [
    values[0]!,
    values[4]!,
    values[8]!,
    values[1]!,
    values[5]!,
    values[9]!,
    values[2]!,
    values[6]!,
    values[10]!
  ];
}

/**
 * Origin of a solver-frame matrix, in global coordinate system millimeters.
 * @param frame Solver-frame matrix to read.
 * @param globalDirections Axis directions the origin is reported in.
 */
function getFrameTranslation(
  frame: Matrix,
  globalDirections: AxisDirections
): [number, number, number] {
  const values = frame.m;
  return convertCoordinate(SOLVER_AXIS_DIRECTIONS, globalDirections, [
    values[12]!,
    values[13]!,
    values[14]!
  ]);
}
