<script setup lang="ts">
import type {
  CoordinateSystemNodeComponent,
  CoordinateSystemValue
} from "@/features/coordinate-system";
import CommittedInput from "@/components/CommittedInput.vue";
import { useValidationRules } from "@/composable/useValidationRules";
import { useCoordinateSystemValueModel } from "../composable/useCoordinateSystemValueModel";

const { entry, component, label } = defineProps<{
  entry: CoordinateSystemValue;
  component: CoordinateSystemNodeComponent;
  label: string;
}>();
const { optionalNumber: rules } = useValidationRules();
const { value, suffix, dragStep } = useCoordinateSystemValueModel(
  () => entry,
  component
);
</script>

<template>
  <CommittedInput
    v-model="value"
    :label="label"
    :suffix="suffix"
    :drag-step="dragStep"
    :rules="rules"
    outlined
    dense
    hide-bottom-space
  />
</template>
