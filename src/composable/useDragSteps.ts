import { computed, type ComputedRef } from "vue";
import { usePreferencesStore } from "@/stores/preferences.store";
import { millimetersToPositionUnit, radiansToRotationUnit } from "@/utils/math";

/** Millimeters a position input moves per pixel of drag at 1x sensitivity. */
const MILLIMETER_DRAG_STEP = 0.01;

/** Radians a rotation input moves per pixel of drag at 1x sensitivity (a tenth of a degree). */
const RADIAN_DRAG_STEP = Math.PI / 1800;

/** Value change per pixel of drag for a unitless input at 1x sensitivity. */
const UNITLESS_DRAG_STEP = 0.01;

/** Per-pixel drag steps for numeric inputs, in the units those inputs display. */
export interface DragSteps {
  positionStep: ComputedRef<number>;
  rotationStep: ComputedRef<number>;
  unitlessStep: ComputedRef<number>;
}

/**
 * Per-pixel drag steps for numeric inputs, scaled by the drag-sensitivity
 * preference and converted into the units the inputs display.
 */
export function useDragSteps(): DragSteps {
  const preferences = usePreferencesStore();

  return {
    positionStep: computed(() =>
      millimetersToPositionUnit(
        MILLIMETER_DRAG_STEP * preferences.dragSensitivity,
        preferences.positionUnit
      )
    ),
    rotationStep: computed(() =>
      radiansToRotationUnit(
        RADIAN_DRAG_STEP * preferences.dragSensitivity,
        preferences.rotationUnit
      )
    ),
    unitlessStep: computed(
      () => UNITLESS_DRAG_STEP * preferences.dragSensitivity
    )
  };
}
