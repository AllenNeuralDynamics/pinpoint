<script lang="ts" setup>
import type {
  CoordinateSystemNodeComponent,
  CoordinateSystemValue
} from "@/features/coordinate-system";
import CommittedInput from "@/components/CommittedInput.vue";
import { useCoordinateSystemValueModel } from "../composable/useCoordinateSystemValueModel";
import { useValidationRules } from "@/composable/useValidationRules";

const { coordinateSystemValue, component, label, ariaLabel, disable } =
  defineProps<{
    coordinateSystemValue: CoordinateSystemValue;
    component: CoordinateSystemNodeComponent;
    label: string;
    ariaLabel: string;
    disable: boolean;
  }>();
const emit = defineEmits<{ commit: [] }>();

const { optionalNumber: numberRules } = useValidationRules();
const { value, suffix } = useCoordinateSystemValueModel(
  () => coordinateSystemValue,
  component
);

/**
 * Write a committed field value through to the coordinate system value, then report the edit
 * so the chain can be re-solved, unless the write left the value unchanged.
 * @param next Committed value, in the display unit.
 */
function onCommit(next: string): void {
  const previous = coordinateSystemValue.value;
  value.value = next;
  if (coordinateSystemValue.value !== previous) emit("commit");
}
</script>

<template>
  <CommittedInput
    :model-value="value"
    @update:model-value="onCommit"
    :aria-label="ariaLabel"
    class="col"
    :disable="disable"
    hide-bottom-space
    :label="label"
    outlined
    :rules="numberRules"
    :suffix="suffix"
  />
</template>
