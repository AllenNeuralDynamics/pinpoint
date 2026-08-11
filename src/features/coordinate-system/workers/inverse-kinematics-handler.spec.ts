import { describe, expect, it, vi } from "vitest";
import {
  buildCoordinateSystemNode,
  buildCoordinateSystemValue,
  buildFixedCoordinateSystemValue
} from "../api/coordinate-system.api";
import {
  isCoordinateSystemSolutionAtPose,
  solveCoordinateSystemChain
} from "../api/forward-kinematics.api";
import {
  SETTLED_SOLVE_STARTS,
  solveCoordinateSystemChainInverse
} from "../api/inverse-kinematics.api";
import { handleInverseKinematicsMessage } from "./inverse-kinematics-handler";
import type { CoordinateSystemNode } from "../model/coordinate-system.model";

// Spy on both solves the handler forwards `referenceOffsetMillimeters` to, while still calling
// through to the real implementation.
vi.mock("../api/forward-kinematics.api", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../api/forward-kinematics.api")>();
  return {
    ...actual,
    solveCoordinateSystemChain: vi.fn(actual.solveCoordinateSystemChain)
  };
});
vi.mock("../api/inverse-kinematics.api", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../api/inverse-kinematics.api")>();
  return {
    ...actual,
    solveCoordinateSystemChainInverse: vi.fn(
      actual.solveCoordinateSystemChainInverse
    )
  };
});

/** Reset every non-fixed value in a chain to zero, mutating it in place. */
function resetFreeValues(chain: CoordinateSystemNode[]): void {
  for (const node of chain) {
    for (const values of [node.position, node.rotation]) {
      for (const value of values) {
        if (!value.fixed) {
          value.value = 0;
        }
      }
    }
  }
}

/** Build the six-free-value node shared by the round-trip fixture, with Pitch bounded. */
function buildFreeNode(): CoordinateSystemNode {
  return buildCoordinateSystemNode(
    "Free",
    [
      buildCoordinateSystemValue("X", null, 10),
      buildCoordinateSystemValue("Y", null, -5),
      buildCoordinateSystemValue("Z", null, 20)
    ],
    [
      buildCoordinateSystemValue("Pitch", [0, Math.PI / 2], 0.3),
      buildCoordinateSystemValue("Yaw", null, 0.5),
      buildCoordinateSystemValue("Roll", null, -0.2)
    ]
  );
}

/** Build the one-free-axis node shared by the round-trip fixture. */
function buildPartlyFreeNode(): CoordinateSystemNode {
  return buildCoordinateSystemNode(
    "Partial",
    [
      buildFixedCoordinateSystemValue("X", 2),
      buildFixedCoordinateSystemValue("Y", 3),
      buildCoordinateSystemValue("Z", null, 7)
    ],
    [
      buildFixedCoordinateSystemValue("Pitch", 0.1),
      buildFixedCoordinateSystemValue("Yaw", 0.2),
      buildFixedCoordinateSystemValue("Roll", 0.3)
    ]
  );
}

describe("handleInverseKinematicsMessage", () => {
  it("solves a request into its reply message, carrying the requestId through and converging", () => {
    const chain = [buildFreeNode(), buildPartlyFreeNode()];
    const solved = solveCoordinateSystemChain(chain, null);
    const target = {
      tipPosition: solved.tipPosition,
      rotation: solved.rotation,
      surfacePosition: null
    };
    resetFreeValues(chain);

    const result = handleInverseKinematicsMessage({
      type: "solveInverseKinematics",
      requestId: 7,
      chain,
      target,
      referenceOffsetMillimeters: null,
      maximumStarts: SETTLED_SOLVE_STARTS
    });

    expect(result.requestId).toBe(7);
    expect(result.status).toBe("converged");
    expect(result.chain).toBe(chain);
    expect(
      isCoordinateSystemSolutionAtPose(
        result.solution,
        target.tipPosition,
        target.rotation,
        1e-4
      )
    ).toBe(true);
  });

  it("forwards a non-null reference offset to both the inverse and forward solves", () => {
    const chain = [buildFreeNode(), buildPartlyFreeNode()];
    const referenceOffsetMillimeters: [number, number, number] = [1, 2, 3];
    const solved = solveCoordinateSystemChain(
      chain,
      referenceOffsetMillimeters
    );
    const target = {
      tipPosition: solved.tipPosition,
      rotation: solved.rotation,
      surfacePosition: null
    };
    resetFreeValues(chain);

    handleInverseKinematicsMessage({
      type: "solveInverseKinematics",
      requestId: 11,
      chain,
      target,
      referenceOffsetMillimeters,
      maximumStarts: SETTLED_SOLVE_STARTS
    });

    expect(solveCoordinateSystemChainInverse).toHaveBeenLastCalledWith(
      chain,
      target,
      referenceOffsetMillimeters,
      SETTLED_SOLVE_STARTS
    );
    expect(solveCoordinateSystemChain).toHaveBeenLastCalledWith(
      chain,
      referenceOffsetMillimeters
    );
  });
});
