import { describe, expect, it } from "vitest";
import {
  PREFERENCES_FILE_NAME,
  applyPreferences,
  parsePreferencesFile,
  serializePreferences
} from "./preferences-file.api";
import type { Preferences } from "@/stores/preferences.store";

/**
 * Build a fully populated `Preferences` fixture, so each test only needs to
 * override the field(s) it cares about.
 */
function makePreferences(overrides: Partial<Preferences> = {}): Preferences {
  return {
    version: "5.0.0",
    appearance: "auto",
    isSplashScreenSkipped: false,
    cameraProjection: "perspective",
    cameraInertia: 0.9,
    worldBackgroundColorLightMode: "#33334d",
    worldBackgroundColorDarkMode: "#33334d",
    worldLightIntensity: 1,
    materialSpecularIntensity: 1,
    materialSpecularPower: 64,
    isSsaoEnabled: true,
    ssaoRatio: 0.5,
    areStructureInteriorsHidden: true,
    positionUnit: "millimeter",
    rotationUnit: "degree",
    positionAxisNames: ["", "", ""],
    rotationAxisNames: ["", "", ""],
    positionAxisOrder: [0, 1, 2],
    rotationAxisOrder: [0, 1, 2],
    decimalPrecision: 3,
    dragSensitivity: 1,
    probeShankThicknessMillimeters: 0.05,
    probeHeadStageLengthMillimeters: 20,
    probeHeadStageCutDepthMillimeters: 17.5,
    probeRodDiameterMillimeters: 8,
    probeRodLengthMillimeters: 200,
    ...overrides
  };
}

describe("PREFERENCES_FILE_NAME", () => {
  it("is a JSON file name", () => {
    expect(PREFERENCES_FILE_NAME).toBe("pinpoint-preferences.json");
  });
});

describe("serializePreferences", () => {
  it("round-trips through parsePreferencesFile, including version", () => {
    const fixture = makePreferences();

    expect(parsePreferencesFile(serializePreferences(fixture))).toEqual(
      fixture
    );
  });

  it("writes only the twenty-six preference keys", () => {
    const fixture = { ...makePreferences(), junk: 1 } as Preferences;

    const keys = Object.keys(JSON.parse(serializePreferences(fixture)));

    expect(keys).toHaveLength(26);
    expect(keys).not.toContain("junk");
  });
});

describe("parsePreferencesFile", () => {
  it("returns null for non-JSON text", () => {
    expect(parsePreferencesFile("not json")).toBeNull();
  });

  it("returns null for a JSON array", () => {
    expect(parsePreferencesFile("[]")).toBeNull();
  });

  it("returns null for a JSON null", () => {
    expect(parsePreferencesFile("null")).toBeNull();
  });

  it("returns null when version is missing", () => {
    const fixture: Partial<Preferences> = makePreferences();
    delete fixture.version;

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null when version is not a string", () => {
    const fixture = { ...makePreferences(), version: 5 };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for an unrecognized cameraProjection", () => {
    const fixture = { ...makePreferences(), cameraProjection: "isometric" };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for an unrecognized appearance", () => {
    const fixture = { ...makePreferences(), appearance: "sepia" };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a non-permutation positionAxisOrder", () => {
    const fixture = { ...makePreferences(), positionAxisOrder: [0, 0, 1] };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a non-string entry in rotationAxisNames", () => {
    const fixture = {
      ...makePreferences(),
      rotationAxisNames: ["", 5, ""]
    };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a two-element positionAxisNames", () => {
    const fixture = { ...makePreferences(), positionAxisNames: ["", ""] };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a malformed worldBackgroundColorLightMode", () => {
    const fixture = {
      ...makePreferences(),
      worldBackgroundColorLightMode: "red"
    };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a malformed worldBackgroundColorDarkMode", () => {
    const fixture = {
      ...makePreferences(),
      worldBackgroundColorDarkMode: "red"
    };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a non-boolean areStructureInteriorsHidden", () => {
    const fixture = {
      ...makePreferences(),
      areStructureInteriorsHidden: "true"
    };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a non-boolean isSsaoEnabled", () => {
    const fixture = { ...makePreferences(), isSsaoEnabled: "true" };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a non-boolean isSplashScreenSkipped", () => {
    const fixture = { ...makePreferences(), isSplashScreenSkipped: "true" };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for an ssaoRatio above 1", () => {
    const fixture = makePreferences({ ssaoRatio: 1.5 });

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null when a numeric field is missing", () => {
    const fixture: Partial<Preferences> = makePreferences();
    delete fixture.cameraInertia;

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a numeric field above its range", () => {
    const fixture = { ...makePreferences(), cameraInertia: 1.5 };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a numeric field below its range", () => {
    const fixture = { ...makePreferences(), materialSpecularPower: 0 };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a dragSensitivity below the 0.25 floor", () => {
    const fixture = { ...makePreferences(), dragSensitivity: 0 };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null for a fractional decimalPrecision", () => {
    const fixture = { ...makePreferences(), decimalPrecision: 2.5 };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("returns null when a numeric field serializes to null (NaN)", () => {
    const fixture = {
      ...makePreferences(),
      probeRodLengthMillimeters: Number.NaN
    };

    expect(parsePreferencesFile(JSON.stringify(fixture))).toBeNull();
  });

  it("accepts a version that isn't valid semver", () => {
    const fixture = makePreferences({ version: "not-semver" });

    expect(parsePreferencesFile(JSON.stringify(fixture))?.version).toBe(
      "not-semver"
    );
  });
});

describe("applyPreferences", () => {
  it("mutates the target in place, copying every non-version field and stamping the given version", () => {
    const target = makePreferences();
    const originalTarget = target;
    const source = makePreferences({
      cameraProjection: "orthographic",
      cameraInertia: 0.1,
      worldBackgroundColorLightMode: "#ff0000",
      worldBackgroundColorDarkMode: "#00ff00",
      areStructureInteriorsHidden: false,
      isSsaoEnabled: false,
      ssaoRatio: 0.25,
      positionUnit: "centimeter",
      rotationUnit: "radian",
      decimalPrecision: 1,
      probeRodLengthMillimeters: 150,
      version: "1.2.3"
    });

    applyPreferences(target, source, "9.9.9");

    expect(target).toBe(originalTarget);
    expect(target).toEqual({ ...source, version: "9.9.9" });
  });

  it("ignores an extra key on the source", () => {
    const target = makePreferences();
    const source = { ...makePreferences(), junk: 1 } as Preferences;

    applyPreferences(target, source, "9.9.9");

    expect(target).not.toHaveProperty("junk");
  });
});
