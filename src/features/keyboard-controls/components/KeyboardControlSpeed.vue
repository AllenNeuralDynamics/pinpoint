<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useUnitLabels } from "@/composable/useUnitLabels";
import type {
  KeyboardControlKind,
  KeyboardControlStep
} from "../models/keyboard-control.model";

const { kind, step } = defineProps<{
  kind: KeyboardControlKind;
  step: KeyboardControlStep;
}>();

const { t } = useI18n();
const unitLabels = useUnitLabels();

/** How far one key press drives the probe, in the driven axis's display unit. */
const speedText = computed(() =>
  kind === "rotate"
    ? t("keyboardControls.rotationSpeed", {
        value: step.rotationDegrees,
        unit: unitLabels.rotation("degree")
      })
    : t("keyboardControls.translationSpeed", {
        value: step.translationMicrometers,
        unit: unitLabels.position("micrometer")
      })
);
</script>

<template>
  <div class="keyboard-control-speed">{{ speedText }}</div>
</template>

<style lang="sass" scoped>
.keyboard-control-speed
  font-size: 0.75rem
  line-height: 1
  pointer-events: none
  user-select: none
</style>
