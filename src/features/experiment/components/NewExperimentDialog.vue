<script lang="ts" setup>
import { computed, ref, useTemplateRef } from "vue";
import { type QInput, useDialogPluginComponent } from "quasar";
import {
  type Atlas,
  AtlasPicker,
  getDefaultStructureIdentifiers,
  getTerminologyRows
} from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { buildInitialReferenceCoordinate } from "../api/reference-coordinate.api";
import { buildExperiment } from "../api/experiment.api";
import { useValidationRules } from "@/composable/useValidationRules";

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
const currentExperimentStore = useCurrentExperimentStore();
const { requiredName: nameRules } = useValidationRules();

const name = ref<string | null>(null);
const atlas = ref<Atlas | null>(null);
const isCreating = ref(false);
const nameInput = useTemplateRef<QInput>("nameInput");

/**
 * Whether the Create button should be disabled.
 */
const isCreateDisabled = computed(() => !name.value || !atlas.value);

/**
 * Create a new experiment with the given name and atlas, seeding its reference
 * coordinate and default structures from the picked atlas.
 */
async function create() {
  if (!name.value || !atlas.value || isCreating.value) return;

  isCreating.value = true;
  const defaultStructureIdentifiers = getDefaultStructureIdentifiers(
    atlas.value.name,
    await getTerminologyRows(atlas.value)
  );
  isCreating.value = false;

  const referenceCoordinate = buildInitialReferenceCoordinate(atlas.value);
  currentExperimentStore.loadExperiment(
    buildExperiment(
      name.value,
      atlas.value,
      referenceCoordinate,
      defaultStructureIdentifiers
    )
  );

  onDialogOK();
}
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="new-experiment fixed-dialog-card">
      <q-card-section>
        <div class="text-h5">{{ $t("newExperiment.title") }}</div>
      </q-card-section>
      <q-card-section
        class="q-gutter-y-md new-experiment__content column no-wrap q-mt-none q-pt-none"
      >
        <q-input
          ref="nameInput"
          v-model="name"
          clearable
          :label="$t('newExperiment.experimentName')"
          lazy-rules
          :rules="nameRules"
          @blur="nameInput?.validate()"
        />

        <AtlasPicker v-model="atlas" class="col" fill-height />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn v-close-popup :label="$t('newExperiment.cancel')" />
        <q-btn
          color="positive"
          icon="add"
          :label="$t('newExperiment.create')"
          :disable="isCreateDisabled"
          :loading="isCreating"
          @click="create"
        >
          <q-tooltip v-if="isCreateDisabled">
            {{ $t("newExperiment.pickNameAndAtlas") }}
          </q-tooltip>
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.new-experiment
  height: 80vh
  display: flex
  flex-direction: column
  overflow: hidden

.new-experiment__content
  flex: 1 1 auto
  min-height: 0
</style>
