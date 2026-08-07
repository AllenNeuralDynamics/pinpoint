/**
 * Check that a value is a plain object (not an array or null).
 * @param value Value to check.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Check that a value is a finite number.
 * @param value Value to check.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Check that a value is a tuple of three finite numbers.
 * @param value Value to check.
 */
export function isFiniteTriple(
  value: unknown
): value is [number, number, number] {
  return (
    Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
  );
}

/** `#RRGGBB`, the only form `Color3.FromHexString` renders correctly. */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Check that a value is a `#RRGGBB` color string.
 * @param value Value to check.
 */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value);
}
