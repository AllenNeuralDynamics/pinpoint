import { describe, expect, it } from "vitest";
import { buildInitialReferenceCoordinate } from "./reference-coordinate.api";
import { makeAtlas, makeManifest } from "@/test/fixtures";

describe("buildInitialReferenceCoordinate", () => {
  it("uses the override for a known atlas name", () => {
    const manifest = makeManifest({
      atlas: makeAtlas({ name: "allen_mouse" }),
      resolutions: [[0.1, 0.1, 0.1]],
      shape: [[100, 100, 100]]
    });

    expect(buildInitialReferenceCoordinate(manifest)).toEqual([5.7, 0.44, 5.4]);
  });

  it("never returns the same array instance across calls, for a known atlas", () => {
    const manifest = makeManifest({
      atlas: makeAtlas({ name: "allen_mouse" }),
      resolutions: [[0.1, 0.1, 0.1]],
      shape: [[100, 100, 100]]
    });

    const first = buildInitialReferenceCoordinate(manifest);
    const second = buildInitialReferenceCoordinate(manifest);
    first[0] = 99;

    expect(second[0]).toBe(5.7);
    expect(first).not.toBe(second);
  });

  it("computes the atlas center when no override exists", () => {
    const manifest = makeManifest({
      atlas: makeAtlas({ name: "allen_human" }),
      resolutions: [[0.02, 0.04, 0.06]],
      shape: [[100, 200, 300]]
    });

    expect(buildInitialReferenceCoordinate(manifest)).toEqual([1, 4, 9]);
  });

  it("falls back to [0, 0, 0] when the manifest has no resolutions or shape", () => {
    const manifest = makeManifest({
      atlas: makeAtlas({ name: "allen_human" }),
      resolutions: [],
      shape: []
    });

    expect(buildInitialReferenceCoordinate(manifest)).toEqual([0, 0, 0]);
  });
});
