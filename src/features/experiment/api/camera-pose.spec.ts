import { describe, expect, it } from "vitest";
import {
  buildCameraPose,
  copyCameraPose,
  frameCameraPoseOnAtlas,
  isCameraPose,
  setCameraPose
} from "./camera-pose.api";
import {
  getAtlasCenter,
  getAtlasDimensionsMillimeters
} from "@/features/atlas";
import { makeAtlas, makeCameraPose } from "@/test/fixtures";

describe("buildCameraPose", () => {
  it("frames the radius at 1.5x the atlas AP length", () => {
    const atlas = makeAtlas();

    const pose = buildCameraPose(atlas, [0, 0, 0]);

    expect(pose.radius).toBe(getAtlasDimensionsMillimeters(atlas)[0] * 1.5);
  });

  it("sets the target to the atlas centre minus the reference coordinate", () => {
    const atlas = makeAtlas();
    const referenceCoordinate: [number, number, number] = [1, 2, 3];

    const pose = buildCameraPose(atlas, referenceCoordinate);

    const centre = getAtlasCenter(atlas);
    expect(pose.target).toEqual([
      centre[0] - referenceCoordinate[0],
      centre[1] - referenceCoordinate[1],
      centre[2] - referenceCoordinate[2]
    ]);
  });

  it("carries the camera inspectable kind and an empty name", () => {
    const pose = buildCameraPose(makeAtlas(), [0, 0, 0]);

    expect(pose.inspectableKind).toBe("camera");
    expect(pose.name).toBe("");
  });

  it("mints a distinct id across calls", () => {
    const a = buildCameraPose(makeAtlas(), [0, 0, 0]);
    const b = buildCameraPose(makeAtlas(), [0, 0, 0]);

    expect(a.id).not.toBe(b.id);
  });
});

describe("frameCameraPoseOnAtlas", () => {
  it("overwrites radius and target from a new atlas", () => {
    const pose = makeCameraPose({ radius: 1, target: [9, 9, 9] });
    const atlas = makeAtlas();

    frameCameraPoseOnAtlas(pose, atlas, [0, 0, 0]);

    expect(pose.radius).toBe(getAtlasDimensionsMillimeters(atlas)[0] * 1.5);
    expect(pose.target).toEqual(getAtlasCenter(atlas));
  });

  it("leaves alpha, beta, id, and name untouched", () => {
    const pose = makeCameraPose({
      id: "kept-id",
      name: "Kept",
      alpha: 1,
      beta: 2
    });

    frameCameraPoseOnAtlas(pose, makeAtlas(), [0, 0, 0]);

    expect(pose.id).toBe("kept-id");
    expect(pose.name).toBe("Kept");
    expect(pose.alpha).toBe(1);
    expect(pose.beta).toBe(2);
  });
});

describe("copyCameraPose", () => {
  it("trims the given name", () => {
    const copy = copyCameraPose(makeCameraPose(), "  Dorsal  ");

    expect(copy.name).toBe("Dorsal");
  });

  it("mints a distinct id from the source pose", () => {
    const source = makeCameraPose({ id: "source-id" });

    const copy = copyCameraPose(source, "Copy");

    expect(copy.id).not.toBe(source.id);
  });

  it("does not alias the source pose's target array", () => {
    const source = makeCameraPose({ target: [1, 2, 3] });

    const copy = copyCameraPose(source, "Copy");
    copy.target[0] = 99;

    expect(source.target).toEqual([1, 2, 3]);
  });
});

describe("setCameraPose", () => {
  it("overwrites orbit and target but keeps id and name", () => {
    const pose = makeCameraPose({ id: "kept-id", name: "Kept" });

    setCameraPose(pose, [1, 2, 3], [4, 5, 6]);

    expect(pose.alpha).toBe(1);
    expect(pose.beta).toBe(2);
    expect(pose.radius).toBe(3);
    expect(pose.target).toEqual([4, 5, 6]);
    expect(pose.id).toBe("kept-id");
    expect(pose.name).toBe("Kept");
  });

  it("does not alias the given target array", () => {
    const pose = makeCameraPose();
    const target: [number, number, number] = [4, 5, 6];

    setCameraPose(pose, [1, 2, 3], target);
    target[0] = 99;

    expect(pose.target).toEqual([4, 5, 6]);
  });
});

describe("isCameraPose", () => {
  it("accepts a well-formed camera pose", () => {
    expect(isCameraPose(makeCameraPose())).toBe(true);
  });

  it("rejects null", () => {
    expect(isCameraPose(null)).toBe(false);
  });

  it("rejects a pose missing inspectableKind", () => {
    const pose = makeCameraPose();
    delete (pose as Partial<typeof pose>).inspectableKind;
    expect(isCameraPose(pose)).toBe(false);
  });

  it("rejects a pose with the wrong inspectableKind", () => {
    expect(
      isCameraPose({ ...makeCameraPose(), inspectableKind: "probe" })
    ).toBe(false);
  });

  it("rejects a pose with a non-finite target", () => {
    expect(isCameraPose({ ...makeCameraPose(), target: [1, NaN, 3] })).toBe(
      false
    );
  });

  it("rejects a pose with a 2-element target", () => {
    expect(isCameraPose({ ...makeCameraPose(), target: [1, 2] })).toBe(false);
  });

  it("rejects a pose with an empty id", () => {
    expect(isCameraPose(makeCameraPose({ id: "" }))).toBe(false);
  });

  it("rejects a pose with a non-finite alpha", () => {
    expect(isCameraPose({ ...makeCameraPose(), alpha: NaN })).toBe(false);
  });
});
