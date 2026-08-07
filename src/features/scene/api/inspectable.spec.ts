import { describe, expect, it } from "vitest";
import { isSameInspectable } from "./inspectable.api";
import { makeCameraPose, makeProbe } from "@/test/fixtures";

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
});
