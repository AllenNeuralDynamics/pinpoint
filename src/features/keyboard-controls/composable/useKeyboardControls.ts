import { computed, ref, type ComputedRef, type Ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { isEditableTarget } from "@/utils/type-guards";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  applyKeyboardControlAction,
  DEFAULT_KEYBOARD_CONTROL_STEP_INDEX,
  KEYBOARD_CONTROL_STEPS,
  resolveKeyboardControlAction,
  resolveKeyboardSpeedDelta,
  stepKeyboardControlIndex
} from "../api/keyboard-control.api";
import type { Probe } from "@/features/probe";
import type {
  KeyboardControlKind,
  KeyboardControlStep
} from "../models/keyboard-control.model";

/** Live keyboard control state, for the overlays that report it. */
export interface KeyboardControls {
  /** Has the user pressed a control key yet, which reveals the overlays. */
  isActive: Ref<boolean>;
  /** Distance and angle one key press currently covers. */
  step: ComputedRef<KeyboardControlStep>;
}

/**
 * Drive a probe's pose from the keyboard, with `-`/`+` walking the speed ladder.
 * @param getProbe Probe the keys drive, or null to ignore them.
 * @param getKind Controls the keys are mapped to, or null to ignore them.
 */
export function useKeyboardControls(
  getProbe: () => Probe | null,
  getKind: () => KeyboardControlKind | null
): KeyboardControls {
  const currentExperiment = useCurrentExperimentStore();
  const isActive = ref(false);
  const stepIndex = ref(DEFAULT_KEYBOARD_CONTROL_STEP_INDEX);

  const step = computed(() => KEYBOARD_CONTROL_STEPS[stepIndex.value]!);

  /**
   * Apply a key press to the probe, or walk the speed ladder, ignoring keys
   * that are neither and presses meant for a text field or a shortcut.
   * @param event Key press to handle.
   */
  function onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;

    const probe = getProbe();
    const kind = getKind();
    if (!probe || !kind) return;

    const speedDelta = resolveKeyboardSpeedDelta(event.code);
    if (speedDelta) {
      stepIndex.value = stepKeyboardControlIndex(stepIndex.value, speedDelta);
      isActive.value = true;
      event.preventDefault();
      return;
    }

    const action = resolveKeyboardControlAction(event.code, kind);
    if (!action) return;

    isActive.value = true;
    event.preventDefault();
    applyKeyboardControlAction(
      probe,
      currentExperiment.axisDirections,
      action,
      step.value
    );
  }

  useEventListener(window, "keydown", onKeyDown);

  return { isActive, step };
}
