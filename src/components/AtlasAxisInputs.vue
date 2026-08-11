<script lang="ts" setup>
import { computed } from "vue";
import type { AtlasAxisKind } from "@/composable/useAtlasAxes";
import { useAtlasAxes } from "@/composable/useAtlasAxes";
import { useDragSteps } from "@/composable/useDragSteps";
import { useNumericTupleModel } from "@/composable/useNumericTupleModel";
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

const { tuple, kind } = defineProps<{
  /** Triple to edit in place, in internal [AP, DV, ML] or [roll, yaw, pitch] order. */
  tuple: [number, number, number];
  /** Which atlas triple this row edits, selecting its unit and default labels. */
  kind: AtlasAxisKind;
}>();

const preferences = usePreferencesStore();
const atlasAxes = useAtlasAxes();
const unitLabels = useUnitLabels();
const { positionStep, rotationStep } = useDragSteps();
const { optionalNumber: numberRules } = useValidationRules();

const models = ([0, 1, 2] as const).map(axis =>
  useNumericTupleModel(
    () => tuple,
    axis,
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
  kind === "position" ? atlasAxes.position.value : atlasAxes.rotation.value
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
