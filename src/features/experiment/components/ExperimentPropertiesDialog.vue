<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch } from "vue";
import { type QInput, useDialogPluginComponent } from "quasar";
import {
  type Atlas,
  AtlasPicker,
  getDefaultStructureIdentifiers,
  getTerminologyRows,
  isSameAtlas
} from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useNumericTupleModel } from "@/composable/useNumericTupleModel";
import { useUnitLabels } from "@/composable/useUnitLabels";
import { useValidationRules } from "@/composable/useValidationRules";
import { isFiniteTriple } from "@/utils/type-guards";
import {
  millimetersToPositionUnit,
  positionUnitToMillimeters
} from "@/utils/math";
import CommittedInput from "@/components/CommittedInput.vue";
import { setExperimentProperties } from "../api/experiment.api";
import { buildInitialReferenceCoordinate } from "../api/reference-coordinate.api";

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
const currentExperimentStore = useCurrentExperimentStore();
const preferences = usePreferencesStore();
const unitLabels = useUnitLabels();
const { requiredName: nameRules, optionalNumber: coordinateRules } =
  useValidationRules();

const nameInput = useTemplateRef<QInput>("nameInput");

const name = ref(currentExperimentStore.name);
const atlas = ref<Atlas | null>({ ...currentExperimentStore.atlas });
const referenceCoordinate = ref<[number, number, number]>([
  ...currentExperimentStore.referenceCoordinate
]);
const isSaving = ref(false);

const positionSuffix = computed(() =>
  unitLabels.position(preferences.positionUnit)
);

const ap = useNumericTupleModel(
  () => referenceCoordinate.value,
  0,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);
const dv = useNumericTupleModel(
  () => referenceCoordinate.value,
  1,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);
const ml = useNumericTupleModel(
  () => referenceCoordinate.value,
  2,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);

/**
 * Whether the Save button should be disabled.
 */
const isSaveDisabled = computed(
  () =>
    name.value.trim().length === 0 ||
    !atlas.value ||
    !isFiniteTriple(referenceCoordinate.value)
);

/**
 * Highlight the whole name so typing replaces it.
 */
function selectName() {
  nameInput.value?.select();
}

/**
 * Commit the edited properties to the current experiment and close.
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
    referenceCoordinate: referenceCoordinate.value,
    defaultStructureIdentifiers
  });

  onDialogOK();
}

// Re-seed the reference coordinate whenever a different atlas is picked: the
// old value is a landmark in the old atlas's space.
watch(atlas, (newAtlas, oldAtlas) => {
  if (!newAtlas || (oldAtlas && isSameAtlas(newAtlas, oldAtlas))) return;

  referenceCoordinate.value = buildInitialReferenceCoordinate(newAtlas);
});
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

        <div>
          <p class="text-h6">
            {{ $t("experimentProperties.referenceCoordinate") }}
          </p>
          <div class="row q-gutter-x-sm">
            <CommittedInput
              v-model="ap"
              class="col"
              :label="$t('axis.ap')"
              :rules="coordinateRules"
              :suffix="positionSuffix"
            />
            <CommittedInput
              v-model="dv"
              class="col"
              :label="$t('axis.dv')"
              :rules="coordinateRules"
              :suffix="positionSuffix"
            />
            <CommittedInput
              v-model="ml"
              class="col"
              :label="$t('axis.ml')"
              :rules="coordinateRules"
              :suffix="positionSuffix"
            />
          </div>
        </div>
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
