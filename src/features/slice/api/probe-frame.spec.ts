import { describe, expect, it } from "vitest";
import { makeProbe } from "@/test/fixtures";
import { getProbeFrame, toAtlasMillimeters } from "./probe-frame.api";

describe("getProbeFrame", () => {
  it("resolves the origin as referenceCoordinate + tipPosition elementwise", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3], rotation: [0, 0, 0] });

    const frame = getProbeFrame(probe, [10, 20, 30]);

    expect(frame.originMillimeters).toEqual([11, 22, 33]);
  });

  it("resolves right and up for the default probe rotation", () => {
    // Default probe rotation [0, 0, pi/2]: electrodes face superior, tip
    // faces anterior. right = across the shanks (ML), up = from the tip (DV
    // superior).
    const probe = makeProbe({
      tipPosition: [0, 0, 0],
      rotation: [0, 0, Math.PI / 2]
    });

    const frame = getProbeFrame(probe, [0, 0, 0]);

    expect(frame.rightMillimeters[0]).toBeCloseTo(0, 6);
    expect(frame.rightMillimeters[1]).toBeCloseTo(0, 6);
    expect(frame.rightMillimeters[2]).toBeCloseTo(1, 6);

    expect(frame.upMillimeters[0]).toBeCloseTo(0, 6);
    expect(frame.upMillimeters[1]).toBeCloseTo(-1, 6);
    expect(frame.upMillimeters[2]).toBeCloseTo(0, 6);
  });

  it("keeps the basis unit-length and orthogonal under an arbitrary rotation", () => {
    const probe = makeProbe({ rotation: [0.3, -0.7, 1.1] });

    const frame = getProbeFrame(probe, [0, 0, 0]);
    const length = (v: [number, number, number]) => Math.hypot(...v);
    const dot = (a: [number, number, number], b: [number, number, number]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    expect(length(frame.rightMillimeters)).toBeCloseTo(1, 6);
    expect(length(frame.upMillimeters)).toBeCloseTo(1, 6);
    expect(dot(frame.rightMillimeters, frame.upMillimeters)).toBeCloseTo(0, 6);
  });
});

describe("toAtlasMillimeters", () => {
  it("returns the frame's origin at (0, 0)", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3] });
    const frame = getProbeFrame(probe, [0, 0, 0]);

    expect(toAtlasMillimeters(frame, 0, 0)).toEqual(frame.originMillimeters);
  });

  it("moves along right and up by the given probe-local offsets", () => {
    const probe = makeProbe({
      tipPosition: [0, 0, 0],
      rotation: [0, 0, Math.PI / 2]
    });
    const frame = getProbeFrame(probe, [0, 0, 0]);

    const result = toAtlasMillimeters(frame, 2, 3);

    // right = [0,0,1] (ML), up = [0,-1,0] (DV superior).
    expect(result[0]).toBeCloseTo(0, 6);
    expect(result[1]).toBeCloseTo(-3, 6);
    expect(result[2]).toBeCloseTo(2, 6);
  });
});
