<script lang="ts" setup>
import { computed, toRef } from "vue";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useUnitLabels } from "@/composable/useUnitLabels";
import {
  millimetersToPositionUnit,
  positionUnitToMillimeters
} from "@/utils/math";
import { useClampedNumberModel } from "../composable/useClampedNumberModel";

const preferences = usePreferencesStore();
const unitLabels = useUnitLabels();

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
</script>

<template>
  <div>
    <div class="text-h6">{{ $t("preferences.probeShape") }}</div>
    <div class="column q-gutter-y-md">
      <q-input
        v-model="shankThickness"
        :label="$t('preferences.shankThickness')"
        :min="0.001"
        :suffix="positionSuffix"
        dense
        outlined
      />
      <q-input
        v-model="headStageLength"
        :label="$t('preferences.headStageLength')"
        :min="0.01"
        :suffix="positionSuffix"
        dense
        outlined
      />
      <q-input
        v-model="headStageCutDepth"
        :label="$t('preferences.headStageCutDepth')"
        :min="0"
        :suffix="positionSuffix"
        dense
        outlined
      />
      <q-input
        v-model="rodDiameter"
        :label="$t('preferences.rodDiameter')"
        :min="0.01"
        :suffix="positionSuffix"
        dense
        outlined
      />
      <q-input
        v-model="rodLength"
        :label="$t('preferences.rodLength')"
        :min="0.01"
        :suffix="positionSuffix"
        dense
        outlined
      />
    </div>
  </div>
</template>
