import { computed, type Ref, type WritableComputedRef } from "vue";
import { clamp } from "@/utils/math";

/**
 * A writable number view onto a preference ref that coerces a numeric input's
 * raw value, drops anything non-finite, and clamps the rest into range.
 * Optionally displays and edits the value in a different unit than it's
 * stored in.
 * @param source Ref holding the preference, in its stored unit.
 * @param minimum Lowest accepted stored value, inclusive.
 * @param maximum Highest accepted stored value, inclusive.
 * @param toDisplay Converts a stored value into the displayed unit.
 * @param fromDisplay Converts a displayed value back into the stored unit.
 */
export function useClampedNumberModel(
  source: Ref<number>,
  minimum: number,
  maximum: number,
  toDisplay: (storedValue: number) => number = value => value,
  fromDisplay: (displayValue: number) => number = value => value
): WritableComputedRef<number, number | string | null> {
  return computed<number, number | string | null>({
    get: () => toDisplay(source.value),
    set: value => {
      const next = Number(value);
      if (value === null || value === "" || !Number.isFinite(next)) return;
      source.value = clamp(fromDisplay(next), minimum, maximum);
    }
  });
}
