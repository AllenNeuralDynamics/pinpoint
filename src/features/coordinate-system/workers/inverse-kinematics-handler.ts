import { solveCoordinateSystemChain } from "../api/forward-kinematics.api";
import { solveCoordinateSystemChainInverse } from "../api/inverse-kinematics.api";
import type {
  SolveInverseKinematicsMessage,
  SolvedInverseKinematicsMessage
} from "../model/inverse-kinematics-message.model";

/**
 * Solve one inverse-kinematics request into its reply message.
 * @param message Request to solve; its chain is mutated in place with the result.
 */
export function handleInverseKinematicsMessage(
  message: SolveInverseKinematicsMessage
): SolvedInverseKinematicsMessage {
  const {
    chain,
    referenceOffsetMillimeters,
    globalDirections,
    localCoordinateSystem
  } = message;
  const status = solveCoordinateSystemChainInverse(
    chain,
    message.target,
    referenceOffsetMillimeters,
    globalDirections,
    localCoordinateSystem,
    message.maximumStarts
  );
  return {
    type: "solvedInverseKinematics",
    requestId: message.requestId,
    status,
    chain,
    solution: solveCoordinateSystemChain(
      chain,
      referenceOffsetMillimeters,
      globalDirections,
      localCoordinateSystem
    )
  };
}
