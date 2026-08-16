<script lang="ts" setup>
import { computed } from "vue";
import { resolveKeyboardControlKind } from "../api/keyboard-control.api";
import { useKeyboardControls } from "../composable/useKeyboardControls";
import KeyboardControlLegend from "./KeyboardControlLegend.vue";
import KeyboardControlSpeed from "./KeyboardControlSpeed.vue";
import type { Probe } from "@/features/probe";
import type { GizmoMode } from "@/features/scene";

const { probe, gizmoMode } = defineProps<{
  probe: Probe | null;
  gizmoMode: GizmoMode;
}>();

/** Controls the enabled gizmo maps the keyboard to, or null when it maps none. */
const kind = computed(() => resolveKeyboardControlKind(gizmoMode));

const { isActive, step } = useKeyboardControls(
  () => probe,
  () => kind.value
);
</script>

<template>
  <template v-if="isActive && kind">
    <div class="keyboard-controls-corner keyboard-controls-corner--left">
      <KeyboardControlLegend :kind="kind" />
    </div>
    <div class="keyboard-controls-corner keyboard-controls-corner--right">
      <KeyboardControlSpeed :kind="kind" :step="step" />
    </div>
  </template>
</template>

<style lang="sass" scoped>
.keyboard-controls-corner
  position: absolute
  bottom: 12px
  color: #ffffff
  pointer-events: none

.keyboard-controls-corner--left
  left: 12px

.keyboard-controls-corner--right
  right: 12px
  padding: 5px 7px
  border-radius: 3px
  background-color: rgba(0, 0, 0, 0.55)
</style>
