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

/** Reset every free value in a chain to zero, mutating it in place. */
function resetFreeValues(chain: CoordinateSystemNode[]): void {
  for (const node of chain) {
    for (const values of [node.position, node.rotation]) {
      for (const value of values) {
        if (value.mode === "free") {
          value.value = 0;
        }
      }
    }
  }
}

/** Build the six-free-value node shared by the round-trip fixtures. */
function buildFreeNode(onSurface = false): CoordinateSystemNode {
  return buildCoordinateSystemNode(
    "Free",
    [
      buildCoordinateSystemValue("X", 10),
      buildCoordinateSystemValue("Y", -5),
      buildCoordinateSystemValue("Z", 20)
    ],
    [
      buildCoordinateSystemValue("Pitch", 0.3),
      buildCoordinateSystemValue("Yaw", 0.5),
      buildCoordinateSystemValue("Roll", -0.2)
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
      buildCoordinateSystemValue("Z", 7)
    ],
    [
      buildFixedCoordinateSystemValue("Pitch", 0.1),
      buildFixedCoordinateSystemValue("Yaw", 0.2),
      buildFixedCoordinateSystemValue("Roll", 0.3)
    ]
  );
}

/** Build the all-fixed node inserted between the round-trip fixtures: a rigid offset with no free value. */
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

/** Build the NewScale-MIS-shaped fixture: two single-axis rotations, a free stage, then depth plus roll. */
function buildNewScaleLikeChain(): CoordinateSystemNode[] {
  return [
    buildCoordinateSystemNode(
      "Arc",
      [
        buildFixedCoordinateSystemValue(),
        buildFixedCoordinateSystemValue(),
        buildFixedCoordinateSystemValue()
      ],
      [
        buildCoordinateSystemValue("Arc Angle", 0.25),
        buildFixedCoordinateSystemValue(),
        buildFixedCoordinateSystemValue()
      ]
    ),
    buildCoordinateSystemNode(
      "Module",
      [
        buildFixedCoordinateSystemValue(),
        buildFixedCoordinateSystemValue(),
        buildFixedCoordinateSystemValue()
      ],
      [
        buildFixedCoordinateSystemValue(),
        buildCoordinateSystemValue("Module Angle", -0.4),
        buildFixedCoordinateSystemValue()
      ]
    ),
    buildCoordinateSystemNode(
      "Stage",
      [
        buildCoordinateSystemValue("X", 3),
        buildCoordinateSystemValue("Y", -2),
        buildCoordinateSystemValue("Z", 5)
      ],
      [
        buildFixedCoordinateSystemValue(),
        buildFixedCoordinateSystemValue(),
        buildFixedCoordinateSystemValue()
      ],
      [0, 1, 2],
      [0, 1, 2],
      true
    ),
    buildCoordinateSystemNode(
      "Depth",
      [
        buildFixedCoordinateSystemValue(),
        buildFixedCoordinateSystemValue(),
        buildCoordinateSystemValue("Depth", 7)
      ],
      [
        buildFixedCoordinateSystemValue(),
        buildFixedCoordinateSystemValue(),
        buildCoordinateSystemValue("Roll", 0.6)
      ]
    )
  ];
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

  it("never moves a user value, treating it as a fixed constraint", () => {
    const node = buildCoordinateSystemNode(
      "User",
      [
        buildCoordinateSystemValue("X", 3, "user"),
        buildCoordinateSystemValue("Y", 1),
        buildCoordinateSystemValue("Z", 2)
      ],
      [
        buildFixedCoordinateSystemValue("Pitch", 0),
        buildFixedCoordinateSystemValue("Yaw", 0),
        buildFixedCoordinateSystemValue("Roll", 0)
      ]
    );
    const chain = [node];
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
    expect(getCoordinateSystemAxisValue(node, "position", 0)).toBe(3);
    const solved = solveCoordinateSystemChain(chain, null);
    expect(solved.tipPosition[0]).toBeCloseTo(target.tipPosition[0], 4);
    expect(solved.tipPosition[1]).toBeCloseTo(target.tipPosition[1], 4);
    expect(solved.tipPosition[2]).toBeCloseTo(target.tipPosition[2], 4);
  });

  it("reports noFreeValues for a chain whose every value is user-constrained", () => {
    const node = buildCoordinateSystemNode(
      "AllUser",
      [
        buildCoordinateSystemValue("X", 1, "user"),
        buildCoordinateSystemValue("Y", 2, "user"),
        buildCoordinateSystemValue("Z", 3, "user")
      ],
      [
        buildCoordinateSystemValue("Pitch", 0.1, "user"),
        buildCoordinateSystemValue("Yaw", 0.2, "user"),
        buildCoordinateSystemValue("Roll", 0.3, "user")
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

  it("keeps the closest reachable tip position when the target orientation is unreachable", () => {
    const node = buildCoordinateSystemNode(
      "Unreachable",
      [
        buildCoordinateSystemValue("X"),
        buildCoordinateSystemValue("Y"),
        buildCoordinateSystemValue("Z")
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

  it("leaves a later node's free value at zero when an earlier node can reach the pose alone", () => {
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
    expect(getCoordinateSystemAxisValue(chain[1]!, "position", 2)).toBe(0);
    const solved = solveCoordinateSystemChain(chain, null);
    expect(
      isCoordinateSystemSolutionAtPose(
        solved,
        target.tipPosition,
        target.rotation,
        1e-4
      )
    ).toBe(true);
  });

  it("spends a later node's free value when a surface goal pins the earlier node", () => {
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
    expect(getCoordinateSystemAxisValue(chain[1]!, "position", 2)).toBeCloseTo(
      7,
      3
    );
  });

  it("uses a later node when the earlier one cannot pose the chain alone", () => {
    const chain = [buildPartlyFreeNode(), buildFreeNode()];
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
    expect(getCoordinateSystemAxisValue(chain[1]!, "position", 0)).not.toBe(0);
    const solved = solveCoordinateSystemChain(chain, null);
    expect(
      isCoordinateSystemSolutionAtPose(
        solved,
        target.tipPosition,
        target.rotation,
        1e-4
      )
    ).toBe(true);
  });

  it("folds a later depth value into the earlier stage axis it shares", () => {
    const chain = buildNewScaleLikeChain();
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
    expect(getCoordinateSystemAxisValue(chain[3]!, "position", 2)).toBe(0);
    expect(getCoordinateSystemAxisValue(chain[3]!, "rotation", 2)).not.toBe(0);
    expect(getCoordinateSystemAxisValue(chain[2]!, "position", 2)).toBeCloseTo(
      12,
      3
    );
    const solved = solveCoordinateSystemChain(chain, null);
    expect(
      isCoordinateSystemSolutionAtPose(
        solved,
        target.tipPosition,
        target.rotation,
        1e-4
      )
    ).toBe(true);
  });

  it("keeps a later depth value when the axis it shares is user-constrained", () => {
    const chain = buildNewScaleLikeChain();
    chain[2]!.position[2] = buildCoordinateSystemValue("Z", 5, "user");
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
    expect(getCoordinateSystemAxisValue(chain[3]!, "position", 2)).toBeCloseTo(
      7,
      3
    );
  });

  it("holds every free value of a redundant later node at zero", () => {
    const chain = [buildFreeNode(), buildFreeNode()];
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
    for (const axis of [0, 1, 2]) {
      expect(getCoordinateSystemAxisValue(chain[1]!, "position", axis)).toBe(0);
      expect(getCoordinateSystemAxisValue(chain[1]!, "rotation", axis)).toBe(0);
    }
    const solved = solveCoordinateSystemChain(chain, null);
    expect(
      isCoordinateSystemSolutionAtPose(
        solved,
        target.tipPosition,
        target.rotation,
        1e-4
      )
    ).toBe(true);
  });
});
