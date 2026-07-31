import { describe, it, expect } from "vitest";
import { isSameInspectable } from "./inspectable.api";
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

  it("returns false when the inspectable kinds differ", () => {
    const a = makeProbe({ id: "A" });
    const b = { ...makeProbe({ id: "A" }), inspectableKind: "other" };

    expect(isSameInspectable(a, b as unknown as typeof a)).toBe(false);
  });
});
