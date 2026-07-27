<script lang="ts" setup>
import { computed, ref } from "vue";
import { Atlas, AtlasPicker, getManifest } from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useDialogPluginComponent } from "quasar";
import {
  buildInitialReferenceCoordinate,
  FALLBACK_REFERENCE_COORDINATE
} from "../api/reference-coordinate.api";

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
const currentExperimentStore = useCurrentExperimentStore();

const name = ref<string | null>(null);
const atlas = ref<Atlas | null>(null);

/**
 * Whether the Create button should be disabled.
 */
const isCreateDisabled = computed(() => !name.value || !atlas.value);

/**
 * Create a new experiment with the given name and atlas, seeding its
 * reference coordinate from the atlas's default reference coordinate.
 */
async function create() {
  if (!name.value || !atlas.value) return;

  // Build initial reference coordinate.
  const manifest = await getManifest(atlas.value);
  const referenceCoordinate = manifest
    ? buildInitialReferenceCoordinate(manifest)
    : FALLBACK_REFERENCE_COORDINATE;

  currentExperimentStore.create(name.value, atlas.value, referenceCoordinate);

  onDialogOK();
}
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="new-experiment">
      <q-card-section class="q-gutter-y-md">
        <p class="text-h5">{{ $t("newExperiment.title") }}</p>

        <q-input
          v-model="name"
          clearable
          :label="$t('newExperiment.experimentName')"
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
</style>
