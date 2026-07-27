import { describe, expect, it } from "vitest";
import {
  buildInitialReferenceCoordinate,
  FALLBACK_REFERENCE_COORDINATE
} from "./reference-coordinate.api";
import { makeManifest } from "@/test/fixtures";

describe("buildInitialReferenceCoordinate", () => {
  it("uses the override for a known atlas name", () => {
    const manifest = makeManifest({
      name: "allen_mouse",
      resolutions: [[0.1, 0.1, 0.1]],
      shape: [[100, 100, 100]]
    });

    expect(buildInitialReferenceCoordinate(manifest)).toEqual([5.7, 0.44, 5.4]);
  });

  it("computes the atlas center when no override exists", () => {
    const manifest = makeManifest({
      name: "allen_human",
      resolutions: [[0.02, 0.04, 0.06]],
      shape: [[100, 200, 300]]
    });

    expect(buildInitialReferenceCoordinate(manifest)).toEqual([1, 4, 9]);
  });

  it("falls back when the manifest has no resolutions or shape", () => {
    const manifest = makeManifest({
      name: "allen_human",
      resolutions: [],
      shape: []
    });

    expect(buildInitialReferenceCoordinate(manifest)).toEqual(
      FALLBACK_REFERENCE_COORDINATE
    );
  });
});
