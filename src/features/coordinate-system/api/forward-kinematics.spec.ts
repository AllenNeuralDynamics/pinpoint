import { describe, expect, it } from "vitest";
import {
  buildCoordinateSystemNode,
  buildCoordinateSystemValue
} from "./coordinate-system.api";
import {
  isCoordinateSystemSolutionAtPose,
  solveCoordinateSystemChain
} from "./forward-kinematics.api";
import type { CoordinateSystemNode } from "../model/coordinate-system.model";

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

describe("solveCoordinateSystemChain", () => {
  it("behaves exactly like typing into state for a single identity node", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);

    const solution = solveCoordinateSystemChain([node], null);

    expect(solution.tipPosition[0]).toBeCloseTo(3);
    expect(solution.tipPosition[1]).toBeCloseTo(2);
    expect(solution.tipPosition[2]).toBeCloseTo(1);
    expect(solution.rotation[0]).toBeCloseTo(0.3);
    expect(solution.rotation[1]).toBeCloseTo(0.2);
    expect(solution.rotation[2]).toBeCloseTo(0.1);
    expect(solution.nodePositions).toHaveLength(1);
    expect(solution.nodePositions[0]![0]).toBeCloseTo(3);
    expect(solution.nodePositions[0]![1]).toBeCloseTo(2);
    expect(solution.nodePositions[0]![2]).toBeCloseTo(1);
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
      null
    );
    const permutedSolution = solveCoordinateSystemChain(
      [permutedOrderNode],
      null
    );

    expect(permutedSolution.tipPosition).toEqual(identitySolution.tipPosition);
    // tipPosition = [ap, dv, ml] = [axis2, axis1, axis0] = [C, B, A] = [7, 6, 5].
    expect(identitySolution.tipPosition[0]).toBeCloseTo(7);
    expect(identitySolution.tipPosition[1]).toBeCloseTo(6);
    expect(identitySolution.tipPosition[2]).toBeCloseTo(5);
  });

  it("composes a child's translation through its parent's rotation, in chain order", () => {
    // Parent: yaw = pi/2, zero position. Child: translates 2 on axis 1 (DV),
    // zero rotation. Babylon's RotationY maps (x, z) -> (x*cos + z*sin, -x*sin + z*cos),
    // but this node only sets a DV (y) translation, which yaw does not rotate -
    // so the child's DV move stays DV, and the tip is that DV offset.
    const parent = makeIdentityNode([0, 0, 0], [0, Math.PI / 2, 0]);
    const child = makeIdentityNode([0, 2, 0], [0, 0, 0]);

    const solution = solveCoordinateSystemChain([parent, child], null);

    expect(solution.nodePositions).toHaveLength(2);
    expect(solution.nodePositions[0]![0]).toBeCloseTo(0);
    expect(solution.nodePositions[0]![1]).toBeCloseTo(0);
    expect(solution.nodePositions[0]![2]).toBeCloseTo(0);
    expect(solution.tipPosition[0]).toBeCloseTo(0);
    expect(solution.tipPosition[1]).toBeCloseTo(2);
    expect(solution.tipPosition[2]).toBeCloseTo(0);
  });

  it("is the order guard: a parent's yaw rotates a child's AP translation onto ML", () => {
    // node 0: rotation axis 1 (yaw) = pi/2, zero position.
    // node 1: position axis 2 (AP) = 2, zero rotation.
    const node0 = makeIdentityNode([0, 0, 0], [0, Math.PI / 2, 0]);
    const node1 = makeIdentityNode([0, 0, 2], [0, 0, 0]);

    const solution = solveCoordinateSystemChain([node0, node1], null);

    expect(solution.tipPosition[0]).toBeCloseTo(0);
    expect(solution.tipPosition[1]).toBeCloseTo(0);
    expect(solution.tipPosition[2]).toBeCloseTo(2);
    expect(solution.rotation[0]).toBeCloseTo(0);
    expect(solution.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(solution.rotation[2]).toBeCloseTo(0);
  });

  it("shifts every node position and the tip by the reference offset, leaving rotation untouched", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);

    const solution = solveCoordinateSystemChain([node], [10, 20, 30]);

    // Offset is atlas ASR [ap, dv, ml] = [10, 20, 30].
    expect(solution.tipPosition[0]).toBeCloseTo(3 + 10);
    expect(solution.tipPosition[1]).toBeCloseTo(2 + 20);
    expect(solution.tipPosition[2]).toBeCloseTo(1 + 30);
    expect(solution.nodePositions[0]![0]).toBeCloseTo(3 + 10);
    expect(solution.nodePositions[0]![1]).toBeCloseTo(2 + 20);
    expect(solution.nodePositions[0]![2]).toBeCloseTo(1 + 30);
    expect(solution.rotation[0]).toBeCloseTo(0.3);
    expect(solution.rotation[1]).toBeCloseTo(0.2);
    expect(solution.rotation[2]).toBeCloseTo(0.1);
  });

  it("solves an empty chain to the reference offset with zero rotation and no node positions", () => {
    const solution = solveCoordinateSystemChain([], [10, 20, 30]);

    expect(solution.tipPosition).toEqual([10, 20, 30]);
    expect(solution.rotation[0]).toBeCloseTo(0);
    expect(solution.rotation[1]).toBeCloseTo(0);
    expect(solution.rotation[2]).toBeCloseTo(0);
    expect(solution.nodePositions).toEqual([]);
  });

  it("solves an empty chain with no offset to the atlas origin", () => {
    const solution = solveCoordinateSystemChain([], null);

    expect(solution.tipPosition[0]).toBeCloseTo(0);
    expect(solution.tipPosition[1]).toBeCloseTo(0);
    expect(solution.tipPosition[2]).toBeCloseTo(0);
    expect(solution.rotation[0]).toBeCloseTo(0);
    expect(solution.rotation[1]).toBeCloseTo(0);
    expect(solution.rotation[2]).toBeCloseTo(0);
    expect(solution.nodePositions).toEqual([]);
  });
});

describe("isCoordinateSystemSolutionAtPose", () => {
  it("is true for an exact match", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);
    const solution = solveCoordinateSystemChain([node], null);

    expect(
      isCoordinateSystemSolutionAtPose(
        solution,
        solution.tipPosition,
        solution.rotation,
        1e-4
      )
    ).toBe(true);
  });

  it("is true for a rotation expressed in an equivalent Euler branch", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);
    const solution = solveCoordinateSystemChain([node], null);
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
        1e-4
      )
    ).toBe(true);
  });

  it("is false for a position off by more than the tolerance", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);
    const solution = solveCoordinateSystemChain([node], null);
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
        1e-4
      )
    ).toBe(false);
  });

  it("is false for a rotation off by more than the tolerance", () => {
    const node = makeIdentityNode([1, 2, 3], [0.1, 0.2, 0.3]);
    const solution = solveCoordinateSystemChain([node], null);
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
        1e-4
      )
    ).toBe(false);
  });
});
