<script lang="ts" setup>
import { computed, ref, useTemplateRef } from "vue";
import { type QInput, useDialogPluginComponent } from "quasar";
import { type Atlas, AtlasPicker } from "@/features/atlas";
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
const nameInput = useTemplateRef<QInput>("nameInput");

/**
 * Whether the Create button should be disabled.
 */
const isCreateDisabled = computed(() => !name.value || !atlas.value);

/**
 * Create a new experiment with the given name and atlas, seeding its
 * reference coordinate from the atlas's default reference coordinate.
 */
function create() {
  if (!name.value || !atlas.value) return;

  const referenceCoordinate = buildInitialReferenceCoordinate(atlas.value);
  currentExperimentStore.loadExperiment(
    buildExperiment(name.value, atlas.value, referenceCoordinate)
  );

  onDialogOK();
}
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="new-experiment">
      <q-card-section>
        <div class="text-h5">{{ $t("newExperiment.title") }}</div>
      </q-card-section>
      <q-card-section
        class="q-gutter-y-md new-experiment__content q-mt-none q-pt-none"
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

        <AtlasPicker v-model="atlas" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn v-close-popup :label="$t('newExperiment.cancel')" />
        <q-btn
          color="positive"
          icon="add"
          :label="$t('newExperiment.create')"
          :disable="isCreateDisabled"
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
  min-width: 25vw
  width: fit-content
  display: flex
  flex-direction: column
  overflow: hidden

.new-experiment__content
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
</style>
