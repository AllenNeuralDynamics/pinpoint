<script lang="ts" setup>
import { computed } from "vue";
import type { CoordinateAxisKind } from "@/composable/useCoordinateAxes";
import { useCoordinateAxes } from "@/composable/useCoordinateAxes";
import { useDragSteps } from "@/composable/useDragSteps";
import { useNumericModel } from "@/composable/useNumericModel";
import { useUnitLabels } from "@/composable/useUnitLabels";
import { useValidationRules } from "@/composable/useValidationRules";
import { usePreferencesStore } from "@/stores/preferences.store";
import {
  millimetersToPositionUnit,
  positionUnitToMillimeters,
  radiansToRotationUnit,
  rotationUnitToRadians
} from "@/utils/math";
import CommittedInput from "./CommittedInput.vue";

defineOptions({ inheritAttrs: false });

const { tuple, kind, offset } = defineProps<{
  /** Triple to edit in place, in the experiment's global coordinate system. */
  tuple: [number, number, number];
  /** Which of the experiment's triples this row edits, selecting its unit and default labels. */
  kind: CoordinateAxisKind;
  /** Subtracted from each displayed value and added back on write; omit for none. */
  offset?: [number, number, number];
}>();

const preferences = usePreferencesStore();
const coordinateAxes = useCoordinateAxes();
const unitLabels = useUnitLabels();
const { positionStep, rotationStep } = useDragSteps();
const { optionalNumber: numberRules } = useValidationRules();

const models = ([0, 1, 2] as const).map(axis =>
  useNumericModel(
    () => tuple[axis] - (offset?.[axis] ?? 0),
    storedValue => (tuple[axis] = storedValue + (offset?.[axis] ?? 0)),
    stored =>
      kind === "position"
        ? millimetersToPositionUnit(stored, preferences.positionUnit)
        : radiansToRotationUnit(stored, preferences.rotationUnit),
    display =>
      kind === "position"
        ? positionUnitToMillimeters(display, preferences.positionUnit)
        : rotationUnitToRadians(display, preferences.rotationUnit),
    () => preferences.decimalPrecision
  )
);

const slots = computed(() =>
  kind === "position"
    ? coordinateAxes.position.value
    : coordinateAxes.rotation.value
);
const suffix = computed(() =>
  kind === "position"
    ? unitLabels.position(preferences.positionUnit)
    : unitLabels.rotation(preferences.rotationUnit)
);
const dragStep = computed(() =>
  kind === "position" ? positionStep.value : rotationStep.value
);
</script>

<template>
  <div class="row q-gutter-x-sm">
    <CommittedInput
      v-for="slot of slots"
      :key="slot.axis"
      v-model="models[slot.axis]!.value"
      v-bind="$attrs"
      class="col"
      :drag-step="dragStep"
      :label="slot.label"
      :rules="numberRules"
      :suffix="suffix"
    />
  </div>
</template>
