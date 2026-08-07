import type { Appearance } from "./appearance.api";
import type { CameraProjection } from "@/features/scene";
import type { Preferences } from "@/stores/preferences.store";
import type { PositionUnit, RotationUnit } from "@/utils/math";
import { isFiniteNumber, isRecord } from "@/utils/type-guards";

/** File name a downloaded preferences file is saved under. */
export const PREFERENCES_FILE_NAME = "pinpoint-preferences.json";

/**
 * Serialize a preferences source to the JSON text written to a preferences file.
 * @param preferences Preferences to serialize.
 */
export function serializePreferences(preferences: Preferences): string {
  return JSON.stringify(
    pickPreferences(preferences, preferences.version),
    null,
    FILE_INDENT
  );
}

/**
 * Parse and validate preferences file text, or null when it isn't a
 * well-formed set of preferences.
 * @param text Raw contents of a preferences JSON file.
 */
export function parsePreferencesFile(text: string): Preferences | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  return isPreferences(data) ? data : null;
}

/**
 * Copy every preference value onto the preferences store in place, stamping
 * the running Pinpoint version instead of the source's.
 * @param store Preferences store to write into.
 * @param preferences Values to apply.
 * @param appVersion Running Pinpoint version to stamp.
 */
export function applyPreferences(
  store: Preferences,
  preferences: Preferences,
  appVersion: string
): void {
  Object.assign(store, pickPreferences(preferences, appVersion));
}

/** Keys of every numeric preference. */
type NumericPreferenceKey = {
  [K in keyof Preferences]: Preferences[K] extends number ? K : never;
}[keyof Preferences];

/** Indentation for written preferences files, so they stay human-diffable. */
const FILE_INDENT = 2;

/** Accepted form of a preference holding a color. */
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const CAMERA_PROJECTIONS: readonly string[] = [
  "perspective",
  "orthographic"
] satisfies readonly CameraProjection[];

const POSITION_UNITS: readonly string[] = [
  "centimeter",
  "millimeter",
  "micrometer"
] satisfies readonly PositionUnit[];

const ROTATION_UNITS: readonly string[] = [
  "degree",
  "radian"
] satisfies readonly RotationUnit[];

const APPEARANCES: readonly string[] = [
  "light",
  "dark",
  "auto"
] satisfies readonly Appearance[];

/**
 * Inclusive bounds each numeric preference must fall inside, matching the
 * ranges the preference inputs clamp to.
 */
const NUMERIC_PREFERENCE_RANGES = {
  cameraInertia: [0, 1],
  worldLightIntensity: [0, 2],
  materialSpecularIntensity: [0, 1],
  materialSpecularPower: [1, 128],
  ssaoRatio: [0.1, 1],
  decimalPrecision: [0, 10],
  probeShankThicknessMillimeters: [0.001, 100],
  probeHeadStageLengthMillimeters: [0.01, 1000],
  probeHeadStageCutDepthMillimeters: [0, 1000],
  probeRodDiameterMillimeters: [0.01, 1000],
  probeRodLengthMillimeters: [0.01, 10_000]
} as const satisfies Record<NumericPreferenceKey, readonly [number, number]>;

/**
 * Check that a value has the shape of a `Preferences`, with every numeric
 * field inside the range its preference input accepts.
 * @param value Value to check.
 */
function isPreferences(value: unknown): value is Preferences {
  if (!isRecord(value)) return false;

  const {
    version,
    appearance,
    isSplashScreenSkipped,
    cameraProjection,
    worldBackgroundColor,
    isSsaoEnabled,
    areStructureInteriorsHidden,
    positionUnit,
    rotationUnit
  } = value;

  if (typeof version !== "string") return false;
  if (
    typeof cameraProjection !== "string" ||
    !CAMERA_PROJECTIONS.includes(cameraProjection)
  ) {
    return false;
  }
  if (
    typeof worldBackgroundColor !== "string" ||
    !HEX_COLOR_PATTERN.test(worldBackgroundColor)
  ) {
    return false;
  }
  if (typeof areStructureInteriorsHidden !== "boolean") return false;
  if (typeof isSplashScreenSkipped !== "boolean") return false;
  if (typeof isSsaoEnabled !== "boolean") return false;
  if (
    typeof positionUnit !== "string" ||
    !POSITION_UNITS.includes(positionUnit)
  )
    return false;
  if (
    typeof rotationUnit !== "string" ||
    !ROTATION_UNITS.includes(rotationUnit)
  )
    return false;
  if (typeof appearance !== "string" || !APPEARANCES.includes(appearance)) {
    return false;
  }

  for (const [key, [minimum, maximum]] of Object.entries(
    NUMERIC_PREFERENCE_RANGES
  )) {
    const numeric = value[key];
    if (!isFiniteNumber(numeric) || numeric < minimum || numeric > maximum) {
      return false;
    }
  }

  return Number.isInteger(value.decimalPrecision);
}

/**
 * Copy exactly the preference fields off a preferences-shaped source under a
 * given version, so neither a download nor an import carries anything else.
 * @param source Preferences-shaped value to copy from.
 * @param version Version to record on the copy.
 */
function pickPreferences(source: Preferences, version: string): Preferences {
  return {
    version,
    appearance: source.appearance,
    isSplashScreenSkipped: source.isSplashScreenSkipped,
    cameraProjection: source.cameraProjection,
    cameraInertia: source.cameraInertia,
    worldBackgroundColor: source.worldBackgroundColor,
    worldLightIntensity: source.worldLightIntensity,
    materialSpecularIntensity: source.materialSpecularIntensity,
    materialSpecularPower: source.materialSpecularPower,
    isSsaoEnabled: source.isSsaoEnabled,
    ssaoRatio: source.ssaoRatio,
    areStructureInteriorsHidden: source.areStructureInteriorsHidden,
    positionUnit: source.positionUnit,
    rotationUnit: source.rotationUnit,
    decimalPrecision: source.decimalPrecision,
    probeShankThicknessMillimeters: source.probeShankThicknessMillimeters,
    probeHeadStageLengthMillimeters: source.probeHeadStageLengthMillimeters,
    probeHeadStageCutDepthMillimeters: source.probeHeadStageCutDepthMillimeters,
    probeRodDiameterMillimeters: source.probeRodDiameterMillimeters,
    probeRodLengthMillimeters: source.probeRodLengthMillimeters
  };
}
