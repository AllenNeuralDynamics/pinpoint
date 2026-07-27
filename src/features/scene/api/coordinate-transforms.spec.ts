import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import { asrToBabylon, babylonToAsr } from "./coordinate-transforms.api";

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

describe("babylonToAsr", () => {
  it("maps -Z -> A, -Y -> S, +X -> R (inverse of asrToBabylon)", () => {
    const result = babylonToAsr(new Vector3(3, -2, -1));
    expect(result).toEqual([1, 2, 3]);
  });

  it("handles the zero vector", () => {
    // -0 for the negated axes is expected (matches -0/-0/0 exactly, per
    // babylonToAsr's `[-z, -y, x]` mapping).
    expect(babylonToAsr(new Vector3(0, 0, 0))).toEqual([-0, -0, 0]);
  });
});

describe("asrToBabylon / babylonToAsr round-trip", () => {
  const cases: [number, number, number][] = [
    [0, 0, 0],
    [1, 2, 3],
    [-1, -2, -3],
    [5.7, 0.44, 5.4],
    [-5.7, 0.44, -5.4]
  ];

  it.each(cases.map(coordinate => [coordinate] as const))(
    "round-trips %j through babylon space",
    coordinate => {
      const roundTripped = babylonToAsr(asrToBabylon(coordinate));
      expect(roundTripped).toEqual(coordinate);
    }
  );
});
