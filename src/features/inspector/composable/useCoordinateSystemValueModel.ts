import { computed, type ComputedRef, type WritableComputedRef } from "vue";
import type {
  CoordinateSystemNodeComponent,
  CoordinateSystemValue
} from "@/features/coordinate-system";
import { useDragSteps } from "@/composable/useDragSteps";
import { useNumericModel } from "@/composable/useNumericModel";
import { useUnitLabels } from "@/composable/useUnitLabels";
import { usePreferencesStore } from "@/stores/preferences.store";
import {
  millimetersToPositionUnit,
  positionUnitToMillimeters,
  radiansToRotationUnit,
  rotationUnitToRadians
} from "@/utils/math";

/** A coordinate system value's display-unit string model, its unit suffix, and its converters. */
export interface CoordinateSystemValueModel {
  value: WritableComputedRef<string>;
  suffix: ComputedRef<string>;
  toDisplay: (storedValue: number) => number;
  fromDisplay: (displayValue: number) => number;
  dragStep: ComputedRef<number>;
}

/**
 * Bind a coordinate system value to a display-unit string model for a numeric input.
 * @param getCoordinateSystemValue Getter for the value to bind.
 * @param component Whether the value is a position (millimeters) or a rotation (radians).
 */
export function useCoordinateSystemValueModel(
  getCoordinateSystemValue: () => CoordinateSystemValue,
  component: CoordinateSystemNodeComponent
): CoordinateSystemValueModel {
  const preferences = usePreferencesStore();
  const unitLabels = useUnitLabels();
  const { positionStep, rotationStep } = useDragSteps();

  /**
   * Convert a stored value into its display unit for this value's component.
   * @param storedValue Value in the stored unit (millimeters or radians).
   */
  function toDisplay(storedValue: number): number {
    return component === "position"
      ? millimetersToPositionUnit(storedValue, preferences.positionUnit)
      : radiansToRotationUnit(storedValue, preferences.rotationUnit);
  }

  /**
   * Convert a displayed value back into its stored unit for this value's component.
   * @param displayValue Value in the displayed unit.
   */
  function fromDisplay(displayValue: number): number {
    return component === "position"
      ? positionUnitToMillimeters(displayValue, preferences.positionUnit)
      : rotationUnitToRadians(displayValue, preferences.rotationUnit);
  }

  const suffix = computed(() =>
    component === "position"
      ? unitLabels.position(preferences.positionUnit)
      : unitLabels.rotation(preferences.rotationUnit)
  );
  const dragStep = computed(() =>
    component === "position" ? positionStep.value : rotationStep.value
  );
  const value = useNumericModel(
    () => getCoordinateSystemValue().value,
    next => (getCoordinateSystemValue().value = next),
    toDisplay,
    fromDisplay,
    () => preferences.decimalPrecision
  );

  return { value, suffix, toDisplay, fromDisplay, dragStep };
}
