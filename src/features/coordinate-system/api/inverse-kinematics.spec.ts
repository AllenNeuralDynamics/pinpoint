import { describe, expect, it } from "vitest";
import {
  buildCoordinateSystemNode,
  buildCoordinateSystemValue,
  buildFixedCoordinateSystemValue,
  getCoordinateSystemAxisValue
} from "./coordinate-system.api";
import {
  isCoordinateSystemSolutionAtPose,
  solveCoordinateSystemChain
} from "./forward-kinematics.api";
import {
  PREVIEW_SOLVE_STARTS,
  SETTLED_SOLVE_STARTS,
  solveCoordinateSystemChainInverse
} from "./inverse-kinematics.api";
import type { CoordinateSystemTarget } from "./inverse-kinematics.api";
import type { CoordinateSystemNode } from "../model/coordinate-system.model";

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

/** Build the six-free-value node shared by the round-trip fixtures, with Pitch bounded. */
function buildFreeNode(onSurface = false): CoordinateSystemNode {
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
    ],
    [0, 1, 2],
    [0, 1, 2],
    onSurface
  );
}

/** Build the one-free-axis node shared by the round-trip fixtures. */
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

/** Build the all-fixed node inserted between the round-trip fixtures, the `Module Radius` shape. */
function buildInertNode(): CoordinateSystemNode {
  return buildCoordinateSystemNode(
    "Inert",
    [
      buildFixedCoordinateSystemValue("X", 0),
      buildFixedCoordinateSystemValue("Y", 0),
      buildFixedCoordinateSystemValue("Z", 4)
    ],
    [
      buildFixedCoordinateSystemValue("Pitch", 0),
      buildFixedCoordinateSystemValue("Yaw", 0.15),
      buildFixedCoordinateSystemValue("Roll", 0)
    ]
  );
}

describe("solveCoordinateSystemChainInverse", () => {
  it("converges a chain of mixed fixed and free values back onto a target pose", () => {
    const chain = [buildFreeNode(), buildPartlyFreeNode()];
    const target = solveCoordinateSystemChain(chain, null);
    resetFreeValues(chain);

    const status = solveCoordinateSystemChainInverse(
      chain,
      {
        tipPosition: target.tipPosition,
        rotation: target.rotation,
        surfacePosition: null
      },
      null,
      SETTLED_SOLVE_STARTS
    );

    expect(status).toBe("converged");
    const solved = solveCoordinateSystemChain(chain, null);
    expect(solved.tipPosition[0]).toBeCloseTo(target.tipPosition[0], 4);
    expect(solved.tipPosition[1]).toBeCloseTo(target.tipPosition[1], 4);
    expect(solved.tipPosition[2]).toBeCloseTo(target.tipPosition[2], 4);
    expect(
      isCoordinateSystemSolutionAtPose(
        solved,
        target.tipPosition,
        target.rotation,
        1e-4
      )
    ).toBe(true);
  });

  it("converges a surface-constrained chain onto both the tip pose and the surface point", () => {
    const chain = [buildFreeNode(true), buildPartlyFreeNode()];
    const target = solveCoordinateSystemChain(chain, null);
    const surfacePosition = target.nodePositions[0]!;
    resetFreeValues(chain);

    const status = solveCoordinateSystemChainInverse(
      chain,
      {
        tipPosition: target.tipPosition,
        rotation: target.rotation,
        surfacePosition
      },
      null,
      SETTLED_SOLVE_STARTS
    );

    expect(status).toBe("converged");
    const solved = solveCoordinateSystemChain(chain, null);
    expect(solved.tipPosition[0]).toBeCloseTo(target.tipPosition[0], 4);
    expect(solved.tipPosition[1]).toBeCloseTo(target.tipPosition[1], 4);
    expect(solved.tipPosition[2]).toBeCloseTo(target.tipPosition[2], 4);
    expect(solved.nodePositions[0]![0]).toBeCloseTo(surfacePosition[0], 4);
    expect(solved.nodePositions[0]![1]).toBeCloseTo(surfacePosition[1], 4);
    expect(solved.nodePositions[0]![2]).toBeCloseTo(surfacePosition[2], 4);
  });

  it("treats an all-fixed node between two others as inert", () => {
    const chain = [buildFreeNode(), buildInertNode(), buildPartlyFreeNode()];
    const target = solveCoordinateSystemChain(chain, null);
    resetFreeValues(chain);

    const status = solveCoordinateSystemChainInverse(
      chain,
      {
        tipPosition: target.tipPosition,
        rotation: target.rotation,
        surfacePosition: null
      },
      null,
      SETTLED_SOLVE_STARTS
    );

    expect(status).toBe("converged");
    const solved = solveCoordinateSystemChain(chain, null);
    expect(solved.tipPosition[0]).toBeCloseTo(target.tipPosition[0], 4);
    expect(solved.tipPosition[1]).toBeCloseTo(target.tipPosition[1], 4);
    expect(solved.tipPosition[2]).toBeCloseTo(target.tipPosition[2], 4);
  });

  it("honours a non-null reference offset", () => {
    const chain = [buildFreeNode(), buildPartlyFreeNode()];
    const offset: [number, number, number] = [4, -6, 9];
    const target = solveCoordinateSystemChain(chain, offset);
    resetFreeValues(chain);

    const status = solveCoordinateSystemChainInverse(
      chain,
      {
        tipPosition: target.tipPosition,
        rotation: target.rotation,
        surfacePosition: null
      },
      offset,
      SETTLED_SOLVE_STARTS
    );

    expect(status).toBe("converged");
    const solved = solveCoordinateSystemChain(chain, offset);
    expect(solved.tipPosition[0]).toBeCloseTo(target.tipPosition[0], 4);
    expect(solved.tipPosition[1]).toBeCloseTo(target.tipPosition[1], 4);
    expect(solved.tipPosition[2]).toBeCloseTo(target.tipPosition[2], 4);
  });

  it("clamps a bounded value to its constrained optimum when the target is out of range", () => {
    const node = buildCoordinateSystemNode(
      "Bounded",
      [
        buildCoordinateSystemValue("X", [0, 0.5], 0),
        buildFixedCoordinateSystemValue("Y", 0),
        buildFixedCoordinateSystemValue("Z", 0)
      ],
      [
        buildFixedCoordinateSystemValue("Pitch", 0),
        buildFixedCoordinateSystemValue("Yaw", 0),
        buildFixedCoordinateSystemValue("Roll", 0)
      ]
    );
    const chain = [node];

    const status = solveCoordinateSystemChainInverse(
      chain,
      { tipPosition: [0, 0, 1.2], rotation: [0, 0, 0], surfacePosition: null },
      null,
      SETTLED_SOLVE_STARTS
    );

    expect(status).not.toBe("converged");
    expect(getCoordinateSystemAxisValue(node, "position", 0)).toBeCloseTo(
      0.5,
      4
    );
  });

  it("keeps the closest reachable tip position when the target orientation is unreachable", () => {
    const node = buildCoordinateSystemNode(
      "Unreachable",
      [
        buildCoordinateSystemValue("X", null, 0),
        buildCoordinateSystemValue("Y", null, 0),
        buildCoordinateSystemValue("Z", null, 0)
      ],
      [
        buildFixedCoordinateSystemValue("Pitch", 0.4),
        buildFixedCoordinateSystemValue("Yaw", -0.6),
        buildFixedCoordinateSystemValue("Roll", 0.25)
      ]
    );
    const chain = [node];
    const target: CoordinateSystemTarget = {
      tipPosition: [6, -3, 9],
      rotation: [1, 1.2, 0.7],
      surfacePosition: null
    };

    const status = solveCoordinateSystemChainInverse(
      chain,
      target,
      null,
      SETTLED_SOLVE_STARTS
    );

    expect(status).not.toBe("converged");
    const solved = solveCoordinateSystemChain(chain, null);
    expect(solved.tipPosition[0]).toBeCloseTo(target.tipPosition[0], 4);
    expect(solved.tipPosition[1]).toBeCloseTo(target.tipPosition[1], 4);
    expect(solved.tipPosition[2]).toBeCloseTo(target.tipPosition[2], 4);
    expect(getCoordinateSystemAxisValue(node, "rotation", 0)).toBe(0.4);
    expect(getCoordinateSystemAxisValue(node, "rotation", 1)).toBe(-0.6);
    expect(getCoordinateSystemAxisValue(node, "rotation", 2)).toBe(0.25);
  });

  it("still converges a warm chain with PREVIEW_SOLVE_STARTS", () => {
    const chain = [buildFreeNode(), buildPartlyFreeNode()];
    const target = solveCoordinateSystemChain(chain, null);
    resetFreeValues(chain);
    solveCoordinateSystemChainInverse(
      chain,
      {
        tipPosition: target.tipPosition,
        rotation: target.rotation,
        surfacePosition: null
      },
      null,
      SETTLED_SOLVE_STARTS
    );

    const nudgedTarget: CoordinateSystemTarget = {
      tipPosition: [
        target.tipPosition[0] + 0.2,
        target.tipPosition[1],
        target.tipPosition[2]
      ],
      rotation: target.rotation,
      surfacePosition: null
    };

    const status = solveCoordinateSystemChainInverse(
      chain,
      nudgedTarget,
      null,
      PREVIEW_SOLVE_STARTS
    );

    expect(status).toBe("converged");
  });

  it("returns noFreeValues for an all-fixed chain, leaving every value unchanged", () => {
    const node = buildCoordinateSystemNode(
      "Fixed",
      [
        buildFixedCoordinateSystemValue("X", 1),
        buildFixedCoordinateSystemValue("Y", 2),
        buildFixedCoordinateSystemValue("Z", 3)
      ],
      [
        buildFixedCoordinateSystemValue("Pitch", 0.1),
        buildFixedCoordinateSystemValue("Yaw", 0.2),
        buildFixedCoordinateSystemValue("Roll", 0.3)
      ]
    );
    const chain = [node];

    const status = solveCoordinateSystemChainInverse(
      chain,
      { tipPosition: [0, 0, 0], rotation: [0, 0, 0], surfacePosition: null },
      null,
      SETTLED_SOLVE_STARTS
    );

    expect(status).toBe("noFreeValues");
    expect(getCoordinateSystemAxisValue(node, "position", 0)).toBe(1);
    expect(getCoordinateSystemAxisValue(node, "position", 1)).toBe(2);
    expect(getCoordinateSystemAxisValue(node, "position", 2)).toBe(3);
    expect(getCoordinateSystemAxisValue(node, "rotation", 0)).toBe(0.1);
    expect(getCoordinateSystemAxisValue(node, "rotation", 1)).toBe(0.2);
    expect(getCoordinateSystemAxisValue(node, "rotation", 2)).toBe(0.3);
  });
});
