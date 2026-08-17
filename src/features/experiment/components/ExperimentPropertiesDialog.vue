<script lang="ts" setup>
import { computed, ref, useTemplateRef } from "vue";
import { type QInput, useDialogPluginComponent } from "quasar";
import {
  type Atlas,
  AtlasPicker,
  getDefaultStructureIdentifiers,
  getTerminologyRows,
  isSameAtlas
} from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useValidationRules } from "@/composable/useValidationRules";
import { setExperimentProperties } from "../api/experiment.api";

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
const currentExperimentStore = useCurrentExperimentStore();
const { requiredName: nameRules } = useValidationRules();

const nameInput = useTemplateRef<QInput>("nameInput");

const name = ref(currentExperimentStore.name);
const atlas = ref<Atlas | null>({ ...currentExperimentStore.atlas });
const isSaving = ref(false);

/**
 * Whether the Save button should be disabled.
 */
const isSaveDisabled = computed(
  () => name.value.trim().length === 0 || !atlas.value
);

/**
 * Highlight the whole name so typing replaces it.
 */
function selectName() {
  nameInput.value?.select();
}

/**
 * Commit the edited properties to the current experiment and close. A changed
 * atlas re-seeds the reference coordinate, since it is a landmark in the
 * outgoing atlas's space.
 */
async function save() {
  if (isSaveDisabled.value || !atlas.value || isSaving.value) return;

  const pickedAtlas = atlas.value;
  isSaving.value = true;
  // Only a changed atlas re-seeds the shown structures, so skip the fetch
  // otherwise.
  const defaultStructureIdentifiers = isSameAtlas(
    pickedAtlas,
    currentExperimentStore.atlas
  )
    ? []
    : getDefaultStructureIdentifiers(
        pickedAtlas.name,
        await getTerminologyRows(pickedAtlas)
      );
  isSaving.value = false;

  setExperimentProperties(currentExperimentStore.experiment, {
    name: name.value,
    atlas: pickedAtlas,
    defaultStructureIdentifiers
  });

  onDialogOK();
}
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="experiment-properties">
      <q-card-section>
        <div class="text-h5">{{ $t("experimentProperties.title") }}</div>
      </q-card-section>
      <q-card-section
        class="q-gutter-y-md experiment-properties__content q-mt-none q-pt-none"
      >
        <q-input
          ref="nameInput"
          v-model="name"
          :label="$t('experimentProperties.experimentName')"
          lazy-rules
          :rules="nameRules"
          @blur="nameInput?.validate()"
          @focus="selectName"
        />

        <AtlasPicker v-model="atlas" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn v-close-popup :label="$t('experimentProperties.cancel')" />
        <q-btn
          color="positive"
          icon="save"
          :label="$t('experimentProperties.save')"
          :disable="isSaveDisabled"
          :loading="isSaving"
          @click="save"
        >
          <q-tooltip v-if="isSaveDisabled">
            {{ $t("experimentProperties.incomplete") }}
          </q-tooltip>
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.experiment-properties
  min-width: 30vw
  width: fit-content
  display: flex
  flex-direction: column
  overflow: hidden

.experiment-properties__content
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
</style>
