/** Index into an axis-ordered triple: 0 = X, 1 = Y, 2 = Z. */
export type AxisIndex = 0 | 1 | 2;

/** A permutation of the three axis indexes, as display slot -> axis index. */
export type AxisOrder = [AxisIndex, AxisIndex, AxisIndex];

/** One axis as it is displayed: which triple element it addresses, and its label. */
export interface AxisSlot {
  axis: AxisIndex;
  label: string;
}

/** Display slot order that shows the triple in its internal x, y, z order. */
export const IDENTITY_AXIS_ORDER: AxisOrder = [0, 1, 2];

/**
 * Check that a value is a permutation of the three axis indexes, which every
 * axis lookup indexes blindly.
 * @param value Value to check.
 */
export function isAxisOrder(value: unknown): value is AxisOrder {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    [0, 1, 2].every(index => value.includes(index))
  );
}

/**
 * Move one display slot within an axis order, in place.
 * @param order Axis order to permute, mutated in place.
 * @param fromSlot Slot to move.
 * @param toSlot Slot to move it to.
 */
export function moveAxisSlot(
  order: AxisOrder,
  fromSlot: number,
  toSlot: number
): void {
  if (
    fromSlot === toSlot ||
    fromSlot < 0 ||
    fromSlot > 2 ||
    toSlot < 0 ||
    toSlot > 2
  ) {
    return;
  }
  order.splice(toSlot, 0, ...order.splice(fromSlot, 1));
}

/**
 * Display-ordered axis slots, each labelled by its user name or, when that is
 * empty, by its built-in name.
 * @param order Axis order to read slots from.
 * @param names Per-axis user names, indexed by axis; an empty name falls back.
 * @param defaultNames Per-axis built-in labels, indexed by axis.
 */
export function getAxisSlots(
  order: AxisOrder,
  names: readonly [string, string, string],
  defaultNames: readonly [string, string, string]
): AxisSlot[] {
  return order.map(axis => ({
    axis,
    label: names[axis] || defaultNames[axis]!
  }));
}
