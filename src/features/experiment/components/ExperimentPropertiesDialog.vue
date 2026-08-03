<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch } from "vue";
import {
  type QInput,
  useDialogPluginComponent,
  type ValidationRule
} from "quasar";
import { useI18n } from "vue-i18n";
import { Atlas, AtlasPicker, getManifest, isSameAtlas } from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useNotify } from "@/composable/useNotify";
import { useNumericTupleModel } from "@/composable/useNumericTupleModel";
import { isFiniteTriple } from "@/utils/type-guards";
import CommittedInput from "@/components/CommittedInput.vue";
import { setExperimentProperties } from "../api/experiment.api";
import { buildInitialReferenceCoordinate } from "../api/reference-coordinate.api";

defineEmits([...useDialogPluginComponent.emits]);

const { t } = useI18n();
const { notifyError } = useNotify();
const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
const currentExperimentStore = useCurrentExperimentStore();

const nameInput = useTemplateRef<QInput>("nameInput");

const name = ref(currentExperimentStore.name);
const atlas = ref<Atlas | null>({ ...currentExperimentStore.atlas });
const referenceCoordinate = ref<[number, number, number]>([
  ...currentExperimentStore.referenceCoordinate
]);
const isReseeding = ref(false);

const ap = useNumericTupleModel(() => referenceCoordinate.value, 0);
const dv = useNumericTupleModel(() => referenceCoordinate.value, 1);
const ml = useNumericTupleModel(() => referenceCoordinate.value, 2);

/**
 * Whether the Save button should be disabled.
 */
const isSaveDisabled = computed(
  () =>
    name.value.trim().length === 0 ||
    !atlas.value ||
    !isFiniteTriple(referenceCoordinate.value) ||
    isReseeding.value
);

/**
 * Hint explaining why Save is unavailable.
 */
const saveHint = computed(() =>
  isReseeding.value
    ? t("experimentProperties.loadingAtlas")
    : t("experimentProperties.incomplete")
);

const nameRules: ValidationRule<string>[] = [
  value => value.trim().length > 0 || t("experimentProperties.nameRequired")
];

// A blank field commits as `Number("") === 0`, matching the probe inspector.
const coordinateRules: ValidationRule<string>[] = [
  value =>
    value.trim().length === 0 ||
    Number.isFinite(Number(value)) ||
    t("experimentProperties.mustBeNumber")
];

/**
 * Highlight the whole name so typing replaces it.
 */
function selectName() {
  nameInput.value?.select();
}

/**
 * Commit the edited properties to the current experiment and close.
 */
function save() {
  if (isSaveDisabled.value || !atlas.value) return;

  setExperimentProperties(currentExperimentStore.experiment, {
    name: name.value,
    atlas: atlas.value,
    referenceCoordinate: referenceCoordinate.value
  });

  onDialogOK();
}

// Re-seed the reference coordinate whenever a different atlas is picked: the
// old value is a landmark in the old atlas's space.
watch(atlas, async (newAtlas, oldAtlas) => {
  if (!newAtlas || (oldAtlas && isSameAtlas(newAtlas, oldAtlas))) return;

  isReseeding.value = true;
  const manifest = await getManifest(newAtlas);

  // A newer pick superseded this fetch; that run owns the flag and the value.
  if (!atlas.value || !isSameAtlas(atlas.value, newAtlas)) return;

  isReseeding.value = false;

  if (!manifest) {
    notifyError(
      t("experimentProperties.failedToFetchAtlas"),
      t("experimentProperties.checkAtlas")
    );
    return;
  }

  referenceCoordinate.value = [...buildInitialReferenceCoordinate(manifest)];
});
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="experiment-properties">
      <q-card-section class="q-gutter-y-md">
        <p class="text-h5">{{ $t("experimentProperties.title") }}</p>

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
              :label="$t('experimentProperties.ap')"
              :rules="coordinateRules"
            />
            <CommittedInput
              v-model="dv"
              class="col"
              :label="$t('experimentProperties.dv')"
              :rules="coordinateRules"
            />
            <CommittedInput
              v-model="ml"
              class="col"
              :label="$t('experimentProperties.ml')"
              :rules="coordinateRules"
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
          @click="save"
        >
          <q-tooltip v-if="isSaveDisabled">{{ saveHint }}</q-tooltip>
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.experiment-properties
  min-width: 30vw
  width: fit-content
</style>
