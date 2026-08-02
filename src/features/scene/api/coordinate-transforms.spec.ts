import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import {
  asrToBabylon,
  asrToVector3,
  vector3ToAsr
} from "./coordinate-transforms.api";

describe("asrToBabylon", () => {
  it("maps A -> -Z, S -> -Y, R -> +X", () => {
    const result = asrToBabylon([1, 2, 3]);
    expect(result).toBeInstanceOf(Vector3);
    expect(result.x).toBe(3);
    expect(result.y).toBe(-2);
    expect(result.z).toBe(-1);
  });

  it("handles the zero vector", () => {
    // -0 for the negated axes is expected (matches asrToBabylon's
    // `[r, -s, -a]` mapping); `.toEqual` treats -0 and +0 as equal.
    const result = asrToBabylon([0, 0, 0]);
    expect([result.x, result.y, result.z]).toEqual([0, -0, -0]);
  });

  it("negates through negative inputs", () => {
    const result = asrToBabylon([-1, -2, -3]);
    expect(result.x).toBe(-3);
    expect(result.y).toBe(2);
    expect(result.z).toBe(1);
  });
});

describe("asrToVector3", () => {
  it("swaps A -> Z, S -> Y, R -> X with no negation", () => {
    const result = asrToVector3([1, 2, 3]);
    expect(result).toBeInstanceOf(Vector3);
    expect(result.x).toBe(3);
    expect(result.y).toBe(2);
    expect(result.z).toBe(1);
  });

  it("handles the zero vector", () => {
    expect(asrToVector3([0, 0, 0]).asArray()).toEqual([0, 0, 0]);
  });
});

describe("vector3ToAsr", () => {
  it("swaps Z -> A, Y -> S, X -> R (inverse of asrToVector3)", () => {
    const result = vector3ToAsr(new Vector3(3, 2, 1));
    expect(result).toEqual([1, 2, 3]);
  });

  it("handles the zero vector", () => {
    expect(vector3ToAsr(new Vector3(0, 0, 0))).toEqual([0, 0, 0]);
  });
});

describe("asrToVector3 / vector3ToAsr round-trip", () => {
  // These two are what both probe gizmo bugs hinge on: syncProbes writes
  // `asrToVector3(probe.tipPosition)` as a plain position, and the drag
  // observer reads it back with `vector3ToAsr(node.position)`. If they ever
  // stop being exact inverses, a probe would drift every time it's dragged.
  const cases: [number, number, number][] = [
    [0, 0, 0],
    [1, 2, 3],
    [-1, -2, -3],
    [0, 0, Math.PI / 2],
    [0.3, 0.4, 0.5]
  ];

  it.each(cases.map(coordinate => [coordinate] as const))(
    "round-trips %j through a Vector3",
    coordinate => {
      const roundTripped = vector3ToAsr(asrToVector3(coordinate));
      expect(roundTripped).toEqual(coordinate);
    }
  );
});
