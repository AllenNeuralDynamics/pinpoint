<script lang="ts" setup>
import { computed } from "vue";
import {
  KEYBOARD_CONTROL_AXIS_INDEX,
  KEYBOARD_CONTROL_ROWS,
  KEYBOARD_SPEED_KEYS
} from "../api/keyboard-control.api";
import { useAtlasAxes } from "@/composable/useAtlasAxes";
import type {
  KeyboardControlAxis,
  KeyboardControlKind
} from "../models/keyboard-control.model";

const { kind } = defineProps<{ kind: KeyboardControlKind }>();

const atlasAxes = useAtlasAxes();

/** Key pairs the active controls map, one row per axis. */
const rows = computed(() => KEYBOARD_CONTROL_ROWS[kind]);

/** Axis labels of the triple the active controls drive, in the user's names. */
const axisSlots = computed(() =>
  kind === "rotate" ? atlasAxes.rotation.value : atlasAxes.position.value
);

/**
 * Label for an axis, as the user names it. Every axis has a slot, so the lookup
 * always resolves.
 * @param axis Axis to label.
 */
function axisLabel(axis: KeyboardControlAxis): string {
  const index = KEYBOARD_CONTROL_AXIS_INDEX[axis];
  return axisSlots.value.find(slot => slot.axis === index)!.label;
}
</script>

<template>
  <div class="keyboard-control-legend column q-gutter-y-xs">
    <div
      v-for="row of rows"
      :key="row.axis"
      class="row items-center no-wrap q-gutter-x-xs"
      :class="`axis-${row.axis}`"
    >
      <kbd>{{ row.negative.label }}</kbd>
      <kbd>{{ row.positive.label }}</kbd>
      <span class="axis-label">{{ axisLabel(row.axis) }}</span>
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

// Matched to the scene's axis guide colors: AP blue, DV green, ML red.
.axis-ap
  color: #6688ff

.axis-dv
  color: #55dd55

.axis-ml
  color: #ff6666

.axis-speed
  color: #cccccc
</style>
