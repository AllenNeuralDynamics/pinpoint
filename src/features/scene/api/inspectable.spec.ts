import { describe, expect, it } from "vitest";
import {
  isSameInspectable,
  moveInspectableToMillimeters
} from "./inspectable.api";
import { WORLD_INSPECTABLE } from "../models/inspectable.model";
import { makeCameraPose, makeProbe, makeSceneObject } from "@/test/fixtures";

describe("isSameInspectable", () => {
  it("returns true for two probes with the same id, even with different names", () => {
    const a = makeProbe({ id: "A", name: "One" });
    const b = makeProbe({ id: "A", name: "Two" });

    expect(isSameInspectable(a, b)).toBe(true);
  });

  it("returns false for two probes with different ids, even with the same name", () => {
    const a = makeProbe({ id: "A", name: "Probe" });
    const b = makeProbe({ id: "B", name: "Probe" });

    expect(isSameInspectable(a, b)).toBe(false);
  });

  it("returns false for a probe and a scene object with the same id", () => {
    const probe = makeProbe({ id: "A" });
    const sceneObject = makeSceneObject({ id: "A" });

    expect(isSameInspectable(probe, sceneObject)).toBe(false);
  });

  it("returns true for two camera poses", () => {
    expect(
      isSameInspectable(
        makeCameraPose({ id: "A" }),
        makeCameraPose({ id: "B" })
      )
    ).toBe(true);
  });

  it("returns false for a camera pose and a probe", () => {
    const probe = makeProbe();

    expect(isSameInspectable(makeCameraPose(), probe)).toBe(false);
  });

  it("returns true for two world inspectables", () => {
    expect(isSameInspectable(WORLD_INSPECTABLE, WORLD_INSPECTABLE)).toBe(true);
  });

  it("returns false for the world and a probe", () => {
    expect(isSameInspectable(WORLD_INSPECTABLE, makeProbe())).toBe(false);
  });
});

describe("moveInspectableToMillimeters", () => {
  const atlasMillimeters: [number, number, number] = [10, 20, 30];

  it("moves a probe's tip to the destination", () => {
    const probe = makeProbe();

    moveInspectableToMillimeters(probe, atlasMillimeters);

    expect(probe.tipPosition).toEqual([10, 20, 30]);
  });

  it("moves a scene object's position, leaving other fields untouched", () => {
    const sceneObject = makeSceneObject({ rotation: [1, 2, 3] });

    moveInspectableToMillimeters(sceneObject, atlasMillimeters);

    expect(sceneObject.position).toEqual([10, 20, 30]);
    expect(sceneObject.rotation).toEqual([1, 2, 3]);
  });

  it("moves a camera's target, leaving its orbit untouched", () => {
    const cameraPose = makeCameraPose({ alpha: 1, beta: 2, radius: 3 });

    moveInspectableToMillimeters(cameraPose, atlasMillimeters);

    expect(cameraPose.target).toEqual([10, 20, 30]);
    expect(cameraPose.alpha).toBe(1);
    expect(cameraPose.beta).toBe(2);
    expect(cameraPose.radius).toBe(3);
  });

  it("leaves the world unchanged", () => {
    moveInspectableToMillimeters(WORLD_INSPECTABLE, atlasMillimeters);

    expect(WORLD_INSPECTABLE).toEqual({ inspectableKind: "world" });
  });
});
