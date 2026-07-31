<script lang="ts" setup>
import { nextTick, ref, useTemplateRef, watch } from "vue";
import { QInput, type ValidationRule } from "quasar";

const { rules } = defineProps<{
  rules: ValidationRule<string>[];
}>();

const model = defineModel<string>({ required: true });

const input = useTemplateRef<QInput>("input");

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
    :rules="rules"
    lazy-rules
    @blur="commit"
    @focus="selectAll"
    @keyup.enter="commit"
  />
</template>

<style lang="sass" scoped></style>
