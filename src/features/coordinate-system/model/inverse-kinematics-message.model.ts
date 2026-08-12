import type { CoordinateSystemSolution } from "../api/forward-kinematics.api";
import type {
  CoordinateSystemSolveStatus,
  CoordinateSystemTarget
} from "../api/inverse-kinematics.api";
import type { CoordinateSystemNode } from "./coordinate-system.model";

/** Solve one transform chain onto a target pose. */
export interface SolveInverseKinematicsMessage {
  type: "solveInverseKinematics";
  requestId: number;
  chain: CoordinateSystemNode[];
  target: CoordinateSystemTarget;
  referenceOffsetMillimeters: [number, number, number] | null;
  maximumStarts: number;
}

/** Messages the main thread sends to an inverse-kinematics worker. */
export type InboundInverseKinematicsMessage = SolveInverseKinematicsMessage;

/** One completed solve: the solved chain, its status, and its forward solution. */
export interface SolvedInverseKinematicsMessage {
  type: "solvedInverseKinematics";
  requestId: number;
  status: CoordinateSystemSolveStatus;
  chain: CoordinateSystemNode[];
  solution: CoordinateSystemSolution;
}

/** One solve that threw inside the worker, so the request yields no result. */
export interface FailedInverseKinematicsMessage {
  type: "failedInverseKinematics";
  requestId: number;
}

/** Messages an inverse-kinematics worker sends to the main thread. */
export type OutboundInverseKinematicsMessage =
  | SolvedInverseKinematicsMessage
  | FailedInverseKinematicsMessage;
