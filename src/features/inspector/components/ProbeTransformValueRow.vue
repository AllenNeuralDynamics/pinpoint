<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  type CoordinateSystemNode,
  type CoordinateSystemNodeComponent,
  getCoordinateSystemSlots
} from "@/features/coordinate-system";
import ProbeTransformValueInput from "./ProbeTransformValueInput.vue";

const AXIS_MESSAGE_KEYS = ["axis.x", "axis.y", "axis.z"] as const;

const { node, component, label, disable } = defineProps<{
  node: CoordinateSystemNode;
  component: CoordinateSystemNodeComponent;
  label: string;
  disable: boolean;
}>();
const emit = defineEmits<{ commit: [] }>();

const { t } = useI18n();

// Fixed values are never editable, so they are omitted rather than shown
// disabled. Free and user values both are.
const adjustableSlots = computed(() =>
  getCoordinateSystemSlots(node, component).filter(
    ({ value }) => value.mode !== "fixed"
  )
);

/**
 * Label a slot by its value's own name, or by its axis letter when unnamed.
 * @param axis Axis the slot drives.
 * @param name Value's own name, if any.
 */
function slotLabel(axis: number, name: string): string {
  return name || t(AXIS_MESSAGE_KEYS[axis] ?? "axis.x");
}
</script>

<template>
  <div v-if="adjustableSlots.length">
    <div class="text-body2 q-pb-xs">{{ label }}</div>
    <div class="row q-gutter-x-sm">
      <ProbeTransformValueInput
        v-for="slot of adjustableSlots"
        :key="slot.axis"
        :ariaLabel="
          t('probeInspector.transformValue', {
            transform: node.name,
            name: slotLabel(slot.axis, slot.value.name)
          })
        "
        :component="component"
        :coordinate-system-value="slot.value"
        :disable="disable"
        :label="slotLabel(slot.axis, slot.value.name)"
        @commit="emit('commit')"
      />
    </div>
  </div>
</template>
