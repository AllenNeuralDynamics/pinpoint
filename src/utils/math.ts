/** Length unit a millimeter value can be displayed in. */
export type PositionUnit = "centimeter" | "millimeter" | "micrometer";

/** Angle unit a radian value can be displayed in. */
export type RotationUnit = "degree" | "radian";

const MILLIMETERS_PER_POSITION_UNIT: Record<PositionUnit, number> = {
  centimeter: 10,
  millimeter: 1,
  micrometer: 0.001
};

const RADIANS_PER_ROTATION_UNIT: Record<RotationUnit, number> = {
  degree: Math.PI / 180,
  radian: 1
};

/**
 * Restrict a value to a closed range.
 * @param value Value to clamp.
 * @param minimum Lower bound, inclusive.
 * @param maximum Upper bound, inclusive.
 */
export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Convert a millimeter value into the given position unit.
 * @param millimeters Value in millimeters.
 * @param unit Position unit to convert into.
 */
export function millimetersToPositionUnit(
  millimeters: number,
  unit: PositionUnit
): number {
  return millimeters / MILLIMETERS_PER_POSITION_UNIT[unit];
}

/**
 * Convert a value in the given position unit into millimeters.
 * @param value Value in the given position unit.
 * @param unit Position unit the value is in.
 */
export function positionUnitToMillimeters(
  value: number,
  unit: PositionUnit
): number {
  return value * MILLIMETERS_PER_POSITION_UNIT[unit];
}

/**
 * Convert a radian value into the given rotation unit.
 * @param radians Value in radians.
 * @param unit Rotation unit to convert into.
 */
export function radiansToRotationUnit(
  radians: number,
  unit: RotationUnit
): number {
  return radians / RADIANS_PER_ROTATION_UNIT[unit];
}

/**
 * Convert a value in the given rotation unit into radians.
 * @param value Value in the given rotation unit.
 * @param unit Rotation unit the value is in.
 */
export function rotationUnitToRadians(
  value: number,
  unit: RotationUnit
): number {
  return value * RADIANS_PER_ROTATION_UNIT[unit];
}
