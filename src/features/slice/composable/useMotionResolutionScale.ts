import { type Ref, ref, watch } from "vue";
import { useTimeoutFn } from "@vueuse/core";

/** Device-pixel-ratio multiplier applied while the sampled surface keeps moving. */
const MOTION_SCALE = 0.25;

/** Two motion-key changes this close together count as continuous movement. */
const MOTION_WINDOW_MILLISECONDS = 100;

/** Quiet period after the last motion-key change before full resolution returns. */
const MOTION_SETTLE_MILLISECONDS = 150;

/**
 * Scale the sampling resolution down while a motion key keeps changing, back to
 * full once it settles. Returns 1 at rest and `MOTION_SCALE` while moving.
 * @param motionKey Primitive key of everything that would trigger a replan, excluding the scale itself.
 */
export function useMotionResolutionScale(
  motionKey: Ref<string>
): Readonly<Ref<number>> {
  const scale = ref(1);
  // A lone change (a committed numeric input, one slider tick) must not pay for
  // a low-resolution pass it would immediately replace, so movement is only
  // declared once a second change lands inside the window.
  let isRecentChange = false;

  const { start: startWindow } = useTimeoutFn(
    () => (isRecentChange = false),
    MOTION_WINDOW_MILLISECONDS,
    { immediate: false }
  );
  const { start: startSettle } = useTimeoutFn(
    () => (scale.value = 1),
    MOTION_SETTLE_MILLISECONDS,
    { immediate: false }
  );

  watch(motionKey, () => {
    if (isRecentChange) {
      scale.value = MOTION_SCALE;
      startSettle();
    }
    isRecentChange = true;
    startWindow();
  });

  return scale;
}
