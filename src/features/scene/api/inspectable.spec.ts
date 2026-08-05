import { describe, expect, it } from "vitest";
import { isSameInspectable } from "./inspectable.api";
import { CAMERA_INSPECTABLE } from "../models/camera-inspectable.model";
import { makeProbe } from "@/test/fixtures";

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

  it("returns true for two camera inspectables", () => {
    expect(isSameInspectable(CAMERA_INSPECTABLE, CAMERA_INSPECTABLE)).toBe(
      true
    );
  });

  it("returns false for a camera and a probe", () => {
    const probe = makeProbe();

    expect(isSameInspectable(CAMERA_INSPECTABLE, probe)).toBe(false);
  });
});
