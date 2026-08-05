import { computed, type Ref, type WritableComputedRef } from "vue";
import { clamp } from "@/utils/math";

/**
 * A writable number view onto a preference ref that coerces a numeric input's
 * raw value, drops anything non-finite, and clamps the rest into range.
 * @param source Ref holding the preference.
 * @param minimum Lowest accepted value, inclusive.
 * @param maximum Highest accepted value, inclusive.
 */
export function useClampedNumberModel(
  source: Ref<number>,
  minimum: number,
  maximum: number
): WritableComputedRef<number, number | string | null> {
  return computed<number, number | string | null>({
    get: () => source.value,
    set: value => {
      const next = Number(value);
      if (value === null || value === "" || !Number.isFinite(next)) return;
      source.value = clamp(next, minimum, maximum);
    }
  });
}
