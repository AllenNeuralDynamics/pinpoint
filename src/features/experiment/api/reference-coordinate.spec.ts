import { describe, expect, it } from "vitest";
import {
  atlasToReferenceRelative,
  buildInitialReferenceCoordinate,
  referenceRelativeToAtlas
} from "./reference-coordinate.api";
import {
  ATLAS_AXIS_DIRECTIONS,
  buildCoordinateAxis,
  buildDefaultGlobalCoordinateSystem,
  type GlobalCoordinateSystem
} from "@/utils/coordinate-frame";
import { makeAtlas, makeManifest } from "@/test/fixtures";

/**
 * Default right-anterior-superior coordinate system, which reads the atlas's
 * left-right, anterior-posterior and superior-inferior axes in that order and
 * negates the two that point away from anterior and superior.
 */
const RAS = buildDefaultGlobalCoordinateSystem();

/**
 * Coordinate system whose axes are the atlas's own, so an atlas coordinate
 * crosses into it unchanged however `ATLAS_AXIS_DIRECTIONS` is defined.
 */
const ATLAS_ALIGNED: GlobalCoordinateSystem = {
  ...buildDefaultGlobalCoordinateSystem(),
  axes: [
    buildCoordinateAxis(ATLAS_AXIS_DIRECTIONS[0]),
    buildCoordinateAxis(ATLAS_AXIS_DIRECTIONS[1]),
    buildCoordinateAxis(ATLAS_AXIS_DIRECTIONS[2])
  ]
};

describe("buildInitialReferenceCoordinate", () => {
  it("prefers the manifest's bregma over the override for a known atlas name", () => {
    const atlas = makeAtlas({
      name: "allen_mouse",
      manifest: makeManifest({ bregma: [1, 2, 3] })
    });

    expect(buildInitialReferenceCoordinate(atlas, ATLAS_ALIGNED)).toEqual([
      1, 2, 3
    ]);
  });

  it("expresses the bregma in the given coordinate system", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({ bregma: [1, 2, 3] })
    });

    // Right-anterior-superior reads the atlas's ml, ap, si axes in that order.
    // The atlas's ml axis already points to the animal's right, so it carries
    // over unchanged, while its anterior-posterior and superior-inferior axes
    // negate.
    expect(buildInitialReferenceCoordinate(atlas, RAS)).toEqual([3, -1, -2]);
  });

  it("never returns the manifest's bregma array instance", () => {
    const atlas = makeAtlas({ manifest: makeManifest({ bregma: [1, 2, 3] }) });

    const result = buildInitialReferenceCoordinate(atlas, ATLAS_ALIGNED);

    expect(result).not.toBe(atlas.manifest.bregma);
  });

  it("uses the override for a known atlas name", () => {
    const atlas = makeAtlas({ name: "allen_mouse" });

    expect(buildInitialReferenceCoordinate(atlas, ATLAS_ALIGNED)).toEqual([
      5.4, 0.33, 5.7
    ]);
    expect(buildInitialReferenceCoordinate(atlas, RAS)).toEqual([
      5.7, -5.4, -0.33
    ]);
  });

  it("never returns the same array instance across calls, for a known atlas", () => {
    const atlas = makeAtlas({ name: "allen_mouse" });

    const first = buildInitialReferenceCoordinate(atlas, ATLAS_ALIGNED);
    const second = buildInitialReferenceCoordinate(atlas, ATLAS_ALIGNED);
    first[0] = 99;

    expect(second[0]).toBe(5.4);
    expect(first).not.toBe(second);
  });

  it("centres AP and ML at the top of the atlas when no override exists", () => {
    const atlas = makeAtlas({
      name: "allen_human",
      manifest: makeManifest({
        resolutions: [[0.02, 0.04, 0.06]],
        shape: [[100, 200, 300]]
      })
    });

    expect(buildInitialReferenceCoordinate(atlas, ATLAS_ALIGNED)).toEqual([
      1, 0, 9
    ]);
  });

  it("falls back to the atlas origin when the manifest has no resolutions or shape", () => {
    const atlas = makeAtlas({
      name: "allen_human",
      manifest: makeManifest({ resolutions: [], shape: [] })
    });

    for (const value of buildInitialReferenceCoordinate(atlas, RAS)) {
      expect(value).toBeCloseTo(0);
    }
  });
});

describe("referenceRelativeToAtlas", () => {
  it("adds the reference coordinate to a relative coordinate", () => {
    expect(referenceRelativeToAtlas([1, 2, 3], [10, 20, 30])).toEqual([
      11, 22, 33
    ]);
  });
});

describe("atlasToReferenceRelative", () => {
  it("subtracts the reference coordinate from an atlas coordinate", () => {
    expect(atlasToReferenceRelative([1, 2, 3], [11, 22, 33])).toEqual([
      10, 20, 30
    ]);
  });

  it("round-trips a coordinate through referenceRelativeToAtlas", () => {
    const reference: [number, number, number] = [1.5, -2.5, 3.5];

    expect(
      atlasToReferenceRelative(
        reference,
        referenceRelativeToAtlas(reference, [4, 5, 6])
      )
    ).toEqual([4, 5, 6]);
  });
});
