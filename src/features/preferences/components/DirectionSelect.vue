<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  ANATOMICAL_DIRECTIONS,
  type AnatomicalDirection,
  getDirectionMessageKey
} from "@/utils/coordinate-frame";

const { label, ariaLabel } = defineProps<{
  /** Label shown on the select. */
  label: string;
  /** Accessible name of the select; defaults to its label. */
  ariaLabel?: string;
  /** Direction the select currently shows. */
  modelValue: AnatomicalDirection;
}>();
const emit = defineEmits<{
  "update:modelValue": [direction: AnatomicalDirection];
}>();

const { t } = useI18n();

const options = computed(() =>
  ANATOMICAL_DIRECTIONS.map(direction => ({
    label: t(getDirectionMessageKey(direction)),
    value: direction
  }))
);
</script>

<template>
  <q-select
    :aria-label="ariaLabel ?? label"
    dense
    emit-value
    :label="label"
    map-options
    :model-value="modelValue"
    :options="options"
    outlined
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
