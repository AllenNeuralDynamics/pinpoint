import { type WritableComputedRef } from "vue";
import { useNumericModel } from "./useNumericModel";

/**
 * A writable string view onto one element of a numeric tuple, for binding to a
 * numeric input. Reads convert the stored value into display units and round
 * it; writes convert back. Takes getters and converters so a different tuple,
 * unit, or precision is picked up reactively.
 * @param getTuple Getter for the numeric tuple to view.
 * @param index Element of the tuple to bind.
 * @param toDisplay Converts a stored value into the displayed unit.
 * @param fromDisplay Converts a displayed value back into the stored unit.
 * @param getDecimals Getter for the decimal places reads round to, or null for none.
 */
export function useNumericTupleModel(
  getTuple: () => [number, number, number],
  index: 0 | 1 | 2,
  toDisplay: (storedValue: number) => number,
  fromDisplay: (displayValue: number) => number,
  getDecimals: () => number | null
): WritableComputedRef<string> {
  return useNumericModel(
    () => getTuple()[index],
    storedValue => {
      getTuple()[index] = storedValue;
    },
    toDisplay,
    fromDisplay,
    getDecimals
  );
}
