<script lang="ts" setup>
import { computed } from "vue";
import {
  KEYBOARD_CONTROL_ROWS,
  KEYBOARD_SPEED_KEYS
} from "../api/keyboard-control.api";
import { useCoordinateAxes } from "@/composable/useCoordinateAxes";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  getLineAxisIndex,
  type AnatomicalLine
} from "@/utils/coordinate-frame";
import type { KeyboardControlKind } from "../models/keyboard-control.model";

const { kind } = defineProps<{ kind: KeyboardControlKind }>();

const currentExperiment = useCurrentExperimentStore();
const coordinateAxes = useCoordinateAxes();

/** Key pairs the active controls map, one row per anatomical line. */
const rows = computed(() => KEYBOARD_CONTROL_ROWS[kind]);

/** Axis labels of the triple the active controls drive, in the user's names. */
const axisSlots = computed(() =>
  kind === "rotate"
    ? coordinateAxes.rotation.value
    : coordinateAxes.position.value
);

/**
 * Label of the axis running along an anatomical line, as the user names it.
 * Every axis has a slot, so the lookup always resolves.
 * @param line Anatomical line the row's keys drive.
 */
function axisLabel(line: AnatomicalLine): string {
  const index = getLineAxisIndex(currentExperiment.axisDirections, line);
  return axisSlots.value.find(slot => slot.axis === index)!.label;
}
</script>

<template>
  <div class="keyboard-control-legend column q-gutter-y-xs">
    <div
      v-for="row of rows"
      :key="row.line"
      class="row items-center no-wrap q-gutter-x-xs"
      :class="`axis-${row.line}`"
    >
      <kbd v-for="key of row.keys" :key="key.code">{{ key.label }}</kbd>
      <span class="axis-label">{{ axisLabel(row.line) }}</span>
    </div>
    <div class="row items-center no-wrap q-gutter-x-xs axis-speed">
      <kbd>{{ KEYBOARD_SPEED_KEYS.negative.label }}</kbd>
      <kbd>{{ KEYBOARD_SPEED_KEYS.positive.label }}</kbd>
      <span class="axis-label">{{ $t("keyboardControls.speedKeys") }}</span>
    </div>
  </div>
</template>

<style lang="sass" scoped>
.keyboard-control-legend
  font-size: 0.75rem
  line-height: 1
  pointer-events: none
  user-select: none

kbd
  font-family: inherit
  font-size: 0.75rem
  line-height: 1
  min-width: 20px
  text-align: center
  padding: 3px 5px
  border-radius: 3px
  border: 1px solid currentColor
  background-color: rgba(0, 0, 0, 0.55)
  color: inherit

.axis-label
  opacity: 0.8

// Matched to the scene's axis guide colors, which are keyed to the same
// anatomical lines: left-right red, inferior-superior green,
// posterior-anterior blue.
.axis-posteriorAnterior
  color: #6688ff

.axis-inferiorSuperior
  color: #55dd55

.axis-leftRight
  color: #ff6666

.axis-speed
  color: #cccccc
</style>
