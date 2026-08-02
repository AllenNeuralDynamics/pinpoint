/**
 * Restrict a value to a closed range.
 * @param value Value to clamp.
 * @param minimum Lower bound, inclusive.
 * @param maximum Upper bound, inclusive.
 */
export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
