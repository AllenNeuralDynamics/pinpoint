import { computed, type WritableComputedRef } from "vue";

/**
 * A writable string view onto a numeric value, for binding to a numeric input.
 * Reads convert the stored value into display units and round it; writes
 * convert back. Takes getters and setters so a different source, unit, or
 * precision is picked up reactively.
 * @param get Getter for the stored value.
 * @param set Setter for the stored value.
 * @param toDisplay Converts a stored value into the displayed unit.
 * @param fromDisplay Converts a displayed value back into the stored unit.
 * @param getDecimals Getter for the decimal places reads round to, or null for none.
 */
export function useNumericModel(
  get: () => number,
  set: (storedValue: number) => void,
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
    get: () => format(get()),
    set: (value: string) => {
      const storedValue = fromDisplay(Number(value));
      // A blur that did not edit the field commits the rounded string back;
      // ignore it so showing fewer decimals never truncates the store.
      if (format(get()) === format(storedValue)) return;
      set(storedValue);
    }
  });
}
