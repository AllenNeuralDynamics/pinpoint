import { computed, type WritableComputedRef } from "vue";

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
  function format(storedValue: number): string {
    const displayValue = toDisplay(storedValue);
    const decimals = getDecimals();
    return decimals === null
      ? String(displayValue)
      : displayValue.toFixed(decimals);
  }

  return computed({
    get: () => format(getTuple()[index]),
    set: (value: string) => {
      const storedValue = fromDisplay(Number(value));
      const tuple = getTuple();
      // A blur that did not edit the field commits the rounded string back;
      // ignore it so showing fewer decimals never truncates the store.
      if (format(tuple[index]) === format(storedValue)) return;
      tuple[index] = storedValue;
    }
  });
}
