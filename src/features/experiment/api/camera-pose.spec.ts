import { describe, expect, it } from "vitest";
import { buildCameraPose, isCameraPose } from "./camera-pose.api";
import type { CameraPose } from "../models/camera-pose.model";

describe("buildCameraPose", () => {
  it("maps the orbit tuple onto alpha, beta, and radius", () => {
    const pose = buildCameraPose("Dorsal", [1, 2, 3]);

    expect(pose.alpha).toBe(1);
    expect(pose.beta).toBe(2);
    expect(pose.radius).toBe(3);
  });

  it("trims the given name", () => {
    const pose = buildCameraPose("  Dorsal  ", [1, 2, 3]);

    expect(pose.name).toBe("Dorsal");
  });

  it("mints a distinct id across calls", () => {
    const a = buildCameraPose("A", [1, 2, 3]);
    const b = buildCameraPose("B", [1, 2, 3]);

    expect(a.id).not.toBe(b.id);
  });
});

describe("isCameraPose", () => {
  function makePose(overrides: Partial<CameraPose> = {}): CameraPose {
    return {
      id: "a",
      name: "Dorsal",
      alpha: 1,
      beta: 2,
      radius: 3,
      ...overrides
    };
  }

  it("accepts a well-formed camera pose", () => {
    expect(isCameraPose(makePose())).toBe(true);
  });

  it("rejects null", () => {
    expect(isCameraPose(null)).toBe(false);
  });

  it("rejects a pose with an empty id", () => {
    expect(isCameraPose(makePose({ id: "" }))).toBe(false);
  });

  it("rejects a pose with a non-finite alpha", () => {
    expect(isCameraPose({ ...makePose(), alpha: NaN })).toBe(false);
  });

  it("rejects a pose missing radius", () => {
    const pose = makePose();
    delete (pose as Partial<CameraPose>).radius;
    expect(isCameraPose(pose)).toBe(false);
  });
});
