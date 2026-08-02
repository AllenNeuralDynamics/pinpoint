import { computed, type WritableComputedRef } from "vue";

/**
 * A writable string view onto one element of a numeric tuple, for binding to
 * a text input. Reads format the number as a string; writes coerce back.
 * Takes a getter rather than the tuple itself, so switching to a different
 * tuple (e.g. a different probe's `tipPosition`) is picked up reactively.
 * @param getTuple Getter for the numeric tuple to view.
 * @param index Element of the tuple to bind.
 */
export function useNumericTupleModel(
  getTuple: () => [number, number, number],
  index: 0 | 1 | 2
): WritableComputedRef<string> {
  return computed({
    get: () => String(getTuple()[index]),
    set: (value: string) => (getTuple()[index] = Number(value))
  });
}
