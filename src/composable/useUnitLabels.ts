import { useI18n } from "vue-i18n";
import type { PositionUnit, RotationUnit } from "@/utils/math";

/** Localized abbreviation lookups for the position and rotation display units. */
export interface UnitLabels {
  position: (unit: PositionUnit) => string;
  rotation: (unit: RotationUnit) => string;
}

const POSITION_UNIT_MESSAGE_KEYS = {
  inch: "units.inch",
  centimeter: "units.centimeter",
  millimeter: "units.millimeter",
  micrometer: "units.micrometer"
} as const satisfies Record<PositionUnit, string>;

const ROTATION_UNIT_MESSAGE_KEYS = {
  degree: "units.degree",
  radian: "units.radian"
} as const satisfies Record<RotationUnit, string>;

/**
 * Build lookups from a display unit to its localized abbreviation.
 */
export function useUnitLabels(): UnitLabels {
  const { t } = useI18n();

  return {
    position: unit => t(POSITION_UNIT_MESSAGE_KEYS[unit]),
    rotation: unit => t(ROTATION_UNIT_MESSAGE_KEYS[unit])
  };
}
