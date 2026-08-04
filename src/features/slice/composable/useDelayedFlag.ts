import { ref, type Ref, watch } from "vue";
import { useTimeoutFn } from "@vueuse/core";

/**
 * Track a boolean that only turns on after `source` has stayed true for
 * `delayMilliseconds`, and turns off immediately once `source` goes false.
 * @param source Boolean to delay.
 * @param delayMilliseconds Milliseconds `source` must stay true before flipping on.
 */
export function useDelayedFlag(
  source: Ref<boolean>,
  delayMilliseconds: number
): Readonly<Ref<boolean>> {
  const isDelayedFlagVisible = ref(false);
  const { start, stop } = useTimeoutFn(
    () => (isDelayedFlagVisible.value = true),
    delayMilliseconds,
    { immediate: false }
  );

  watch(
    source,
    active => {
      if (active) {
        start();
      } else {
        stop();
        isDelayedFlagVisible.value = false;
      }
    },
    { immediate: true }
  );

  return isDelayedFlagVisible;
}
