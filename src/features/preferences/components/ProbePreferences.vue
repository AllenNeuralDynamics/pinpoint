<script lang="ts" setup>
import { computed, toRef, useTemplateRef } from "vue";
import type { WritableComputedRef } from "vue";
import type { QInput } from "quasar";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useDragSteps } from "@/composable/useDragSteps";
import { useNumberDrag } from "@/composable/useNumberDrag";
import { useUnitLabels } from "@/composable/useUnitLabels";
import {
  millimetersToPositionUnit,
  positionUnitToMillimeters
} from "@/utils/math";
import { useClampedNumberModel } from "../composable/useClampedNumberModel";

const preferences = usePreferencesStore();
const unitLabels = useUnitLabels();
const { positionStep } = useDragSteps();

const positionSuffix = computed(() =>
  unitLabels.position(preferences.positionUnit)
);
const shankThickness = useClampedNumberModel(
  toRef(preferences, "probeShankThicknessMillimeters"),
  0.001,
  100,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit)
);
const headStageLength = useClampedNumberModel(
  toRef(preferences, "probeHeadStageLengthMillimeters"),
  0.01,
  1000,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit)
);
const headStageCutDepth = useClampedNumberModel(
  toRef(preferences, "probeHeadStageCutDepthMillimeters"),
  0,
  1000,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit)
);
const rodDiameter = useClampedNumberModel(
  toRef(preferences, "probeRodDiameterMillimeters"),
  0.01,
  1000,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit)
);
const rodLength = useClampedNumberModel(
  toRef(preferences, "probeRodLengthMillimeters"),
  0.01,
  10_000,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit)
);

/**
 * Scrub a geometry preference by dragging its field horizontally.
 * @param fieldName Template ref name of the field to scrub.
 * @param model Clamped display-unit model the field binds.
 */
function useFieldDrag(
  fieldName: string,
  model: WritableComputedRef<number, number | string | null>
): void {
  const field = useTemplateRef<QInput>(fieldName);
  useNumberDrag(() => field.value, {
    getDragOrigin: () => ({ value: model.value, step: positionStep.value }),
    setValue: next => {
      model.value = next;
    }
  });
}

useFieldDrag("shankThicknessField", shankThickness);
useFieldDrag("headStageLengthField", headStageLength);
useFieldDrag("headStageCutDepthField", headStageCutDepth);
useFieldDrag("rodDiameterField", rodDiameter);
useFieldDrag("rodLengthField", rodLength);
</script>

<template>
  <div>
    <div class="text-h6">{{ $t("preferences.probeShape") }}</div>
    <div class="column q-gutter-y-md">
      <q-input
        ref="shankThicknessField"
        v-model="shankThickness"
        class="drag-number"
        :label="$t('preferences.shankThickness')"
        :min="0.001"
        :suffix="positionSuffix"
        dense
        outlined
      />
      <q-input
        ref="headStageLengthField"
        v-model="headStageLength"
        class="drag-number"
        :label="$t('preferences.headStageLength')"
        :min="0.01"
        :suffix="positionSuffix"
        dense
        outlined
      />
      <q-input
        ref="headStageCutDepthField"
        v-model="headStageCutDepth"
        class="drag-number"
        :label="$t('preferences.headStageCutDepth')"
        :min="0"
        :suffix="positionSuffix"
        dense
        outlined
      />
      <q-input
        ref="rodDiameterField"
        v-model="rodDiameter"
        class="drag-number"
        :label="$t('preferences.rodDiameter')"
        :min="0.01"
        :suffix="positionSuffix"
        dense
        outlined
      />
      <q-input
        ref="rodLengthField"
        v-model="rodLength"
        class="drag-number"
        :label="$t('preferences.rodLength')"
        :min="0.01"
        :suffix="positionSuffix"
        dense
        outlined
      />
    </div>
  </div>
</template>
