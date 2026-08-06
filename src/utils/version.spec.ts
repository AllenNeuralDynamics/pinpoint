import { describe, expect, it } from "vitest";
import { compareFileVersion } from "./version";

describe("compareFileVersion", () => {
  it("matches identical versions", () => {
    expect(compareFileVersion("5.0.0-dev6", "5.0.0-dev6")).toBe("match");
  });

  it("matches when only the prerelease tag differs", () => {
    expect(compareFileVersion("5.0.0", "5.0.0-dev6")).toBe("match");
  });

  it("matches when only the patch differs", () => {
    expect(compareFileVersion("5.0.1", "5.0.0-dev6")).toBe("match");
  });

  it("flags a lower major as majorBehind", () => {
    expect(compareFileVersion("4.9.9", "5.0.0-dev6")).toBe("majorBehind");
  });

  it("flags a higher major (even as a prerelease) as majorAhead", () => {
    expect(compareFileVersion("6.0.0-dev1", "5.0.0-dev6")).toBe("majorAhead");
  });

  it("flags a higher minor at the same major as minorAhead", () => {
    expect(compareFileVersion("5.1.0", "5.0.0-dev6")).toBe("minorAhead");
  });

  it("flags a lower minor at the same major as minorBehind", () => {
    expect(compareFileVersion("5.0.0", "5.2.3")).toBe("minorBehind");
  });

  it("returns unknown for a file version that isn't valid semver", () => {
    expect(compareFileVersion("5.0", "5.0.0-dev6")).toBe("unknown");
  });

  it("accepts a leading v", () => {
    expect(compareFileVersion("v5.0.0", "5.0.0-dev6")).toBe("match");
  });

  it("returns unknown when the running app version isn't valid semver", () => {
    expect(compareFileVersion("5.0.0-dev6", "garbage")).toBe("unknown");
  });
});
