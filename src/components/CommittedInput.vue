<script lang="ts" setup>
import { nextTick, ref, useTemplateRef, watch } from "vue";
import { type QInput, type ValidationRule } from "quasar";
import { useNumberDrag } from "@/composable/useNumberDrag";

const { dragStep } = defineProps<{
  rules: ValidationRule<string>[];
  /** Value change per pixel of horizontal drag; omitted leaves the field type-only. */
  dragStep?: number;
}>();

const model = defineModel<string>({ required: true });

const input = useTemplateRef<QInput>("input");

useNumberDrag(() => input.value, {
  getDragOrigin: () => {
    const parsed = Number(model.value);
    return dragStep !== undefined &&
      model.value.trim() !== "" &&
      Number.isFinite(parsed)
      ? { value: parsed, step: dragStep }
      : null;
  },
  setValue: next => {
    model.value = next.toFixed(decimalPlaces(model.value));
  }
});

const draft = ref(model.value);

/**
 * Highlight the whole value so typing replaces it.
 */
function selectAll() {
  input.value?.select();
}

/**
 * Write the draft to the model when every rule passes, then re-read the
 * model so the field shows its canonical form. Rules must be synchronous.
 */
function commit() {
  if (input.value?.validate() !== true) return;

  model.value = draft.value;
  nextTick(() => (draft.value = model.value));
}

/**
 * Decimal places the field's current text shows, so a dragged value commits in
 * the format the model reads back.
 * @param text Current field text.
 */
function decimalPlaces(text: string): number {
  const separator = text.indexOf(".");
  return separator === -1 ? 0 : text.length - separator - 1;
}

// Re-seed the draft whenever the model changes outside this field, e.g. a
// different probe gets selected or the scene moves the probe.
watch(model, value => {
  draft.value = value;
  input.value?.resetValidation();
});
</script>

<template>
  <q-input
    ref="input"
    v-model="draft"
    :class="{ 'drag-number': dragStep !== undefined }"
    :rules="rules"
    lazy-rules
    @blur="commit"
    @focus="selectAll"
    @keyup.enter="commit"
  />
</template>
