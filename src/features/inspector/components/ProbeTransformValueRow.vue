<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  type CoordinateSystemNode,
  type CoordinateSystemNodeComponent,
  type CoordinateSystemValue,
  getCoordinateSystemValueAxis
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

const values = computed(() =>
  component === "position" ? node.position : node.rotation
);
// Fixed values are never editable, so they are omitted rather than shown
// disabled. `valueIndex` is kept from the original triple so axis-fallback
// labelling and bounds stay correct.
const adjustableValues = computed(() =>
  values.value
    .map((coordinateSystemValue, valueIndex) => ({
      coordinateSystemValue,
      valueIndex
    }))
    .filter(({ coordinateSystemValue }) => !coordinateSystemValue.fixed)
);

/**
 * Label a node value by its own name, or by its mapped axis letter when unnamed.
 * @param coordinateSystemValue Value to label.
 * @param valueIndex Index of the value within its position/rotation triple.
 */
function valueLabel(
  coordinateSystemValue: CoordinateSystemValue,
  valueIndex: number
): string {
  if (coordinateSystemValue.name) return coordinateSystemValue.name;
  const axisIndex = getCoordinateSystemValueAxis(node, component, valueIndex);
  return t(AXIS_MESSAGE_KEYS[axisIndex] ?? "axis.x");
}
</script>

<template>
  <div v-if="adjustableValues.length">
    <div class="text-body2 q-pb-xs">{{ label }}</div>
    <div class="row q-gutter-x-sm">
      <ProbeTransformValueInput
        v-for="{ coordinateSystemValue, valueIndex } of adjustableValues"
        :key="valueIndex"
        :ariaLabel="
          t('probeInspector.transformValue', {
            transform: node.name,
            name: valueLabel(coordinateSystemValue, valueIndex)
          })
        "
        :component="component"
        :coordinate-system-value="coordinateSystemValue"
        :disable="disable"
        :label="valueLabel(coordinateSystemValue, valueIndex)"
        @commit="emit('commit')"
      />
    </div>
  </div>
</template>
