import { describe, expect, it } from "vitest";
import { buildInitialReferenceCoordinate } from "./reference-coordinate.api";
import { makeAtlas, makeManifest } from "@/test/fixtures";

describe("buildInitialReferenceCoordinate", () => {
  it("uses the override for a known atlas name", () => {
    const atlas = makeAtlas({ name: "allen_mouse" });

    expect(buildInitialReferenceCoordinate(atlas)).toEqual([5.7, 0.44, 5.4]);
  });

  it("never returns the same array instance across calls, for a known atlas", () => {
    const atlas = makeAtlas({ name: "allen_mouse" });

    const first = buildInitialReferenceCoordinate(atlas);
    const second = buildInitialReferenceCoordinate(atlas);
    first[0] = 99;

    expect(second[0]).toBe(5.7);
    expect(first).not.toBe(second);
  });

  it("computes the atlas center when no override exists", () => {
    const atlas = makeAtlas({
      name: "allen_human",
      manifest: makeManifest({
        resolutions: [[0.02, 0.04, 0.06]],
        shape: [[100, 200, 300]]
      })
    });

    expect(buildInitialReferenceCoordinate(atlas)).toEqual([1, 4, 9]);
  });

  it("falls back to [0, 0, 0] when the manifest has no resolutions or shape", () => {
    const atlas = makeAtlas({
      name: "allen_human",
      manifest: makeManifest({ resolutions: [], shape: [] })
    });

    expect(buildInitialReferenceCoordinate(atlas)).toEqual([0, 0, 0]);
  });
});
