import { describe, expect, it } from "vitest";
import {
  buildCoordinateSystemNode,
  buildCoordinateSystemValue
} from "./coordinate-system.api";
import {
  getCoordinateSystemNodePose,
  isCoordinateSystemSolutionAtPose,
  solveCoordinateSystemChain
} from "./forward-kinematics.api";
import {
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  CANONICAL_AXIS_DIRECTIONS,
  convertCoordinate,
  getAxisDirections,
  getDirectionVector
} from "@/utils/coordinate-frame";
import type {
  AxisDirections,
  LocalCoordinateSystem
} from "@/utils/coordinate-frame";
import type { CoordinateSystemNode } from "../model/coordinate-system.model";

/** Directions of the default RAS global coordinate system: x right, y anterior, z superior. */
const GLOBAL_DIRECTIONS: AxisDirections = getAxisDirections(
  buildDefaultGlobalCoordinateSystem()
);

/** Default probe rest: depth posterior, electrodes facing superior. */
const LOCAL = buildDefaultLocalCoordinateSystem();

/** A probe resting nose-down, whose depth axis points inferior instead of posterior. */
const DOWNWARD_LOCAL: LocalCoordinateSystem = {
  depthDirection: "Superior_to_inferior",
  forwardDirection: "Posterior_to_anterior"
};

/**
 * Anatomical direction each chain axis points at the default rest: the probe's
 * right axis, its forward axis, then its depth axis. Probe-right lands on the
 * animal's left, because the chain shares its axes with the scene frame, which
 * runs its x along the atlas's left-to-right axis and so is left handed.
 */
const DEFAULT_CHAIN_DIRECTIONS: AxisDirections = [
  "Right_to_left",
  "Inferior_to_superior",
  "Anterior_to_posterior"
];

/** Global directions of an LPI system, which reverses every RAS axis. */
const LPI_DIRECTIONS: AxisDirections = [
  "Right_to_left",
  "Anterior_to_posterior",
  "Superior_to_inferior"
];

/** Build a node with the given axis-ordered position/rotation values under an identity order. */
function makeIdentityNode(
  position: [number, number, number],
  rotation: [number, number, number]
): CoordinateSystemNode {
  return buildCoordinateSystemNode(
    "Node",
    [
      buildCoordinateSystemValue("X", position[0]),
      buildCoordinateSystemValue("Y", position[1]),
      buildCoordinateSystemValue("Z", position[2])
    ],
    [
      buildCoordinateSystemValue("Pitch", rotation[0]),
      buildCoordinateSystemValue("Yaw", rotation[1]),
      buildCoordinateSystemValue("Roll", rotation[2])
    ]
  );
}

/**
 * A chain-frame position re-expressed in the default RAS global system.
 * @param chainMillimeters Position in the chain's rest-oriented frame, in mm.
 */
function toGlobal(
  chainMillimeters: [number, number, number]
): [number, number, number] {
  return convertCoordinate(
    DEFAULT_CHAIN_DIRECTIONS,
    GLOBAL_DIRECTIONS,
    chainMillimeters
  );
}

/**
 * Offset a tip takes when a chain drives it a distance along a probe's local
 * depth direction, in the default RAS global system.
 * @param system Local coordinate system the probe rests in.
 * @param millimeters Distance along the depth axis, in mm.
 */
function toDepthOffset(
  system: LocalCoordinateSystem,
  millimeters: number
): [number, number, number] {
  const depth = convertCoordinate(
    CANONICAL_AXIS_DIRECTIONS,
    GLOBAL_DIRECTIONS,
    getDirectionVector(system.depthDirection)
  );
  return [
    depth[0] * millimeters,
    depth[1] * millimeters,
    depth[2] * millimeters
  ];
}

/**
 * Assert a solved position matches an expected one, component by component.
 * @param actual Position the solver reported.
 * @param expected Position it should have reported.
 */
function expectPosition(
  actual: [number, number, number],
  expected: [number, number, number]
): void {
  for (const [index, value] of expected.entries()) {
    expect(actual[index]).toBeCloseTo(value);
  }
}

describe("solveCoordinateSystemChain", () => {
  it("reads a node's position in the chain's rest-oriented frame", () => {
    const node = makeIdentityNode([1, 2, 3], [0, 0, 0]);

    const solution = solveCoordinateSystemChain(
      [node],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    // The default rest puts chain axis 0 on the animal's left, axis 1 superior,
    // and axis 2 posterior, so [1, 2, 3] is 1 left, 3 posterior, 2 superior.
    expectPosition(solution.tipPosition, toGlobal([1, 2, 3]));
    expect(solution.nodePositions).toHaveLength(1);
    expectPosition(solution.nodePositions[0]!, toGlobal([1, 2, 3]));
  });

  it("solves an all-zero chain to the probe's rest orientation, whatever the local system", () => {
    const chain = [
      makeIdentityNode([0, 0, 0], [0, 0, 0]),
      makeIdentityNode([0, 0, 0], [0, 0, 0])
    ];

    for (const local of [LOCAL, DOWNWARD_LOCAL]) {
      const solution = solveCoordinateSystemChain(
        chain,
        null,
        GLOBAL_DIRECTIONS,
        local
      );

      expect(solution.rotation[0]).toBeCloseTo(0);
      expect(solution.rotation[1]).toBeCloseTo(0);
      expect(solution.rotation[2]).toBeCloseTo(0);
    }
  });

  it("drives the tip along the local depth direction as a depth value grows", () => {
    const node = makeIdentityNode([0, 0, 4], [0, 0, 0]);

    const posterior = solveCoordinateSystemChain(
      [node],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );
    const inferior = solveCoordinateSystemChain(
      [node],
      null,
      GLOBAL_DIRECTIONS,
      DOWNWARD_LOCAL
    );

    // Depth is chain axis 2 by construction, so it follows the local depth
    // direction: posterior for the default rest, inferior for the nose-down one.
    expectPosition(posterior.tipPosition, toDepthOffset(LOCAL, 4));
    expectPosition(inferior.tipPosition, toDepthOffset(DOWNWARD_LOCAL, 4));
  });

  it("reports a roll about the chain's depth axis as a global roll about the posterior-anterior line", () => {
    const node = makeIdentityNode([0, 0, 0], [0, 0, 0.4]);

    const solution = solveCoordinateSystemChain(
      [node],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    // The default depth axis points posterior, and the chain frame is left handed
    // anatomically, so a right-handed chain roll turns right-handed about the
    // global system's anterior axis.
    expect(solution.rotation[0]).toBeCloseTo(0);
    expect(solution.rotation[1]).toBeCloseTo(0.4);
    expect(solution.rotation[2]).toBeCloseTo(0);
  });

  it("expresses the solved tip in the global coordinate system's own axes", () => {
    const node = makeIdentityNode([1, 2, 3], [0, 0, 0]);

    const solution = solveCoordinateSystemChain(
      [node],
      null,
      LPI_DIRECTIONS,
      LOCAL
    );

    // The same pose as the RAS case above, read out in LPI: every axis flips.
    expectPosition(
      solution.tipPosition,
      convertCoordinate(DEFAULT_CHAIN_DIRECTIONS, LPI_DIRECTIONS, [1, 2, 3])
    );
  });

  it("solves independently of the display order, a pure UI concern under the axis-indexed model", () => {
    const identityOrderNode = buildCoordinateSystemNode(
      "Node",
      [
        buildCoordinateSystemValue("A", 5),
        buildCoordinateSystemValue("B", 6),
        buildCoordinateSystemValue("C", 7)
      ],
      [
        buildCoordinateSystemValue("Pitch", 0),
        buildCoordinateSystemValue("Yaw", 0),
        buildCoordinateSystemValue("Roll", 0)
      ]
    );
    const permutedOrderNode = buildCoordinateSystemNode(
      "Node",
      [
        buildCoordinateSystemValue("A", 5),
        buildCoordinateSystemValue("B", 6),
        buildCoordinateSystemValue("C", 7)
      ],
      [
        buildCoordinateSystemValue("Pitch", 0),
        buildCoordinateSystemValue("Yaw", 0),
        buildCoordinateSystemValue("Roll", 0)
      ],
      [1, 2, 0]
    );

    const identitySolution = solveCoordinateSystemChain(
      [identityOrderNode],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );
    const permutedSolution = solveCoordinateSystemChain(
      [permutedOrderNode],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    expect(permutedSolution.tipPosition).toEqual(identitySolution.tipPosition);
    // Rest frame [A, B, C] = [5, 6, 7] is 5 left, 7 posterior, 6 superior.
    expectPosition(identitySolution.tipPosition, toGlobal([5, 6, 7]));
  });

  it("composes a child's translation through its parent's rotation, in chain order", () => {
    // Parent: a quarter turn about chain axis 1, the rest frame's superior axis, zero
    // position. Child: 2 mm along chain axis 1, which that turn leaves alone, so the
    // tip is that 2 mm straight up.
    const parent = makeIdentityNode([0, 0, 0], [0, Math.PI / 2, 0]);
    const child = makeIdentityNode([0, 2, 0], [0, 0, 0]);

    const solution = solveCoordinateSystemChain(
      [parent, child],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    expect(solution.nodePositions).toHaveLength(2);
    expectPosition(solution.nodePositions[0]!, [0, 0, 0]);
    expectPosition(solution.tipPosition, toGlobal([0, 2, 0]));
  });

  it("is the order guard: a parent's turn about the rest frame's superior axis swings a child's depth onto the left-right line", () => {
    const node0 = makeIdentityNode([0, 0, 0], [0, Math.PI / 2, 0]);
    const node1 = makeIdentityNode([0, 0, 2], [0, 0, 0]);

    const solution = solveCoordinateSystemChain(
      [node0, node1],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    // The child's 2 mm of depth, swung a quarter turn about the rest frame's superior
    // axis, lands on chain axis 0, the animal's left. Had the child's translation been
    // applied before its parent's rotation, the tip would have stayed 2 mm posterior.
    expectPosition(solution.tipPosition, toGlobal([2, 0, 0]));
  });

  it("shifts every node position and the tip by the reference offset, leaving rotation untouched", () => {
    const node = makeIdentityNode([1, 2, 3], [0, 0, 0.4]);

    const solution = solveCoordinateSystemChain(
      [node],
      [10, 20, 30],
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    // The offset is in global mm and the rest orientation never turns it.
    const [x, y, z] = toGlobal([1, 2, 3]);
    const expected: [number, number, number] = [x + 10, y + 20, z + 30];
    expectPosition(solution.tipPosition, expected);
    expectPosition(solution.nodePositions[0]!, expected);
    expect(solution.rotation[1]).toBeCloseTo(0.4);
  });

  it("solves an empty chain to the reference offset with zero rotation and no node positions", () => {
    const solution = solveCoordinateSystemChain(
      [],
      [10, 20, 30],
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    expect(solution.tipPosition[0]).toBeCloseTo(10);
    expect(solution.tipPosition[1]).toBeCloseTo(20);
    expect(solution.tipPosition[2]).toBeCloseTo(30);
    expect(solution.rotation[0]).toBeCloseTo(0);
    expect(solution.rotation[1]).toBeCloseTo(0);
    expect(solution.rotation[2]).toBeCloseTo(0);
    expect(solution.nodePositions).toEqual([]);
  });

  it("solves an empty chain with no offset to the atlas origin", () => {
    const solution = solveCoordinateSystemChain(
      [],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    expect(solution.tipPosition[0]).toBeCloseTo(0);
    expect(solution.tipPosition[1]).toBeCloseTo(0);
    expect(solution.tipPosition[2]).toBeCloseTo(0);
    expect(solution.nodePositions).toEqual([]);
  });
});

describe("getCoordinateSystemNodePose", () => {
  it("inverts a single-node chain exactly, for every local system", () => {
    const tipPosition: [number, number, number] = [1.5, -2.5, 3.5];
    const rotation: [number, number, number] = [0.2, -0.3, 0.4];

    for (const local of [LOCAL, DOWNWARD_LOCAL]) {
      const pose = getCoordinateSystemNodePose(
        tipPosition,
        rotation,
        [4, -6, 9],
        GLOBAL_DIRECTIONS,
        local
      );
      const solution = solveCoordinateSystemChain(
        [makeIdentityNode(pose.position, pose.rotation)],
        [4, -6, 9],
        GLOBAL_DIRECTIONS,
        local
      );

      expect(solution.tipPosition[0]).toBeCloseTo(tipPosition[0]);
      expect(solution.tipPosition[1]).toBeCloseTo(tipPosition[1]);
      expect(solution.tipPosition[2]).toBeCloseTo(tipPosition[2]);
      expect(
        isCoordinateSystemSolutionAtPose(
          solution,
          tipPosition,
          rotation,
          GLOBAL_DIRECTIONS,
          1e-6
        )
      ).toBe(true);
    }
  });

  it("puts a probe at rest on an all-zero node", () => {
    const pose = getCoordinateSystemNodePose(
      [0, 0, 0],
      [0, 0, 0],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    expect(pose.position[0]).toBeCloseTo(0);
    expect(pose.position[1]).toBeCloseTo(0);
    expect(pose.position[2]).toBeCloseTo(0);
    expect(pose.rotation[0]).toBeCloseTo(0);
    expect(pose.rotation[1]).toBeCloseTo(0);
    expect(pose.rotation[2]).toBeCloseTo(0);
  });

  it("reads a tip past the reference coordinate as depth on chain axis 2", () => {
    const pose = getCoordinateSystemNodePose(
      toDepthOffset(LOCAL, 4),
      [0, 0, 0],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    // 4 mm along the rest depth direction is 4 mm of depth on chain axis 2.
    expectPosition(pose.position, [0, 0, 4]);
  });
});

describe("isCoordinateSystemSolutionAtPose", () => {
  it("is true for an exact match", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);
    const solution = solveCoordinateSystemChain(
      [node],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );

    expect(
      isCoordinateSystemSolutionAtPose(
        solution,
        solution.tipPosition,
        solution.rotation,
        GLOBAL_DIRECTIONS,
        1e-4
      )
    ).toBe(true);
  });

  it("is true for a rotation expressed in an equivalent branch", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);
    const solution = solveCoordinateSystemChain(
      [node],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );
    const equivalentRotation: [number, number, number] = [
      solution.rotation[0] + 2 * Math.PI,
      solution.rotation[1],
      solution.rotation[2]
    ];

    expect(
      isCoordinateSystemSolutionAtPose(
        solution,
        solution.tipPosition,
        equivalentRotation,
        GLOBAL_DIRECTIONS,
        1e-4
      )
    ).toBe(true);
  });

  it("is false for a position off by more than the tolerance", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);
    const solution = solveCoordinateSystemChain(
      [node],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );
    const offPosition: [number, number, number] = [
      solution.tipPosition[0] + 1,
      solution.tipPosition[1],
      solution.tipPosition[2]
    ];

    expect(
      isCoordinateSystemSolutionAtPose(
        solution,
        offPosition,
        solution.rotation,
        GLOBAL_DIRECTIONS,
        1e-4
      )
    ).toBe(false);
  });

  it("is false for a rotation off by more than the tolerance", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);
    const solution = solveCoordinateSystemChain(
      [node],
      null,
      GLOBAL_DIRECTIONS,
      LOCAL
    );
    const offRotation: [number, number, number] = [
      solution.rotation[0] + 1,
      solution.rotation[1],
      solution.rotation[2]
    ];

    expect(
      isCoordinateSystemSolutionAtPose(
        solution,
        solution.tipPosition,
        offRotation,
        GLOBAL_DIRECTIONS,
        1e-4
      )
    ).toBe(false);
  });
});
