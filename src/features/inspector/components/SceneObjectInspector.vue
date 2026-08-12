<script lang="ts" setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  copySceneObject,
  STANDARD_COLORS,
  type SceneObject,
  toggleSceneObjectCollidable,
  toggleSceneObjectLock
} from "@/features/scene";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useDragSteps } from "@/composable/useDragSteps";
import { useNumericTupleModel } from "@/composable/useNumericTupleModel";
import { useValidationRules } from "@/composable/useValidationRules";
import AtlasAxisInputs from "@/components/AtlasAxisInputs.vue";
import CommittedInput from "@/components/CommittedInput.vue";

const { sceneObject } = defineProps<{
  sceneObject: SceneObject;
}>();

const currentExperimentStore = useCurrentExperimentStore();
const preferences = usePreferencesStore();
const { unitlessStep } = useDragSteps();
const { requiredName: nameRules, positiveNumber: scaleRules } =
  useValidationRules();
const { t } = useI18n();

/** Whether AP/DV/ML fields display the position offset by the reference coordinate. */
const isPositionRelativeToReference = ref(false);

const name = computed({
  get: () => sceneObject.name,
  set: (value: string) => (sceneObject.name = value.trim())
});

/** Reference coordinate to subtract from/add back to AP/DV/ML when the toggle is on, else zero. */
const positionOffset = computed<[number, number, number]>(() =>
  isPositionRelativeToReference.value
    ? currentExperimentStore.referenceCoordinate
    : [0, 0, 0]
);

const scaleZ = useNumericTupleModel(
  () => sceneObject.scale,
  0,
  value => value,
  value => value,
  () => preferences.decimalPrecision
);
const scaleY = useNumericTupleModel(
  () => sceneObject.scale,
  1,
  value => value,
  value => value,
  () => preferences.decimalPrecision
);
const scaleX = useNumericTupleModel(
  () => sceneObject.scale,
  2,
  value => value,
  value => value,
  () => preferences.decimalPrecision
);

const lockIcon = computed(() =>
  sceneObject.lock ? "lock" : "sym_o_lock_open_right"
);
const lockColor = computed(() => (sceneObject.lock ? "accent" : undefined));
const lockLabel = computed(() =>
  sceneObject.lock
    ? t("sceneObjectInspector.unlock")
    : t("sceneObjectInspector.lock")
);
</script>

<template>
  <div class="column q-gutter-y-md">
    <q-btn-group spread>
      <q-btn
        :aria-label="t('sceneObjectInspector.copy')"
        icon="content_copy"
        @click="copySceneObject(currentExperimentStore.experiment, sceneObject)"
      >
        <q-tooltip>{{ t("sceneObjectInspector.copy") }}</q-tooltip>
      </q-btn>
      <q-btn
        :aria-label="lockLabel"
        :color="lockColor"
        :icon="lockIcon"
        @click="toggleSceneObjectLock(sceneObject)"
      >
        <q-tooltip>{{ lockLabel }}</q-tooltip>
      </q-btn>
    </q-btn-group>

    <q-toggle
      :label="t('sceneObjectInspector.collisionDetection')"
      :model-value="sceneObject.collidable"
      @update:model-value="toggleSceneObjectCollidable(sceneObject)"
    />

    <CommittedInput
      v-model="name"
      :label="t('sceneObjectInspector.name')"
      hide-bottom-space
      outlined
      :rules="nameRules"
    />

    <q-toggle
      v-model="isPositionRelativeToReference"
      :label="t('sceneObjectInspector.relativeToReferenceCoordinate')"
    />

    <AtlasAxisInputs
      :disable="sceneObject.lock"
      hide-bottom-space
      kind="position"
      :offset="positionOffset"
      outlined
      :tuple="sceneObject.position"
    />

    <AtlasAxisInputs
      :disable="sceneObject.lock"
      hide-bottom-space
      kind="rotation"
      outlined
      :tuple="sceneObject.rotation"
    />

    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-model="scaleZ"
        :disable="sceneObject.lock"
        :drag-step="unitlessStep"
        :label="t('axis.z')"
        :rules="scaleRules"
        :suffix="t('sceneObjectInspector.scaleSuffix')"
        class="col"
        hide-bottom-space
        outlined
      />
      <CommittedInput
        v-model="scaleY"
        :disable="sceneObject.lock"
        :drag-step="unitlessStep"
        :label="t('axis.y')"
        :rules="scaleRules"
        :suffix="t('sceneObjectInspector.scaleSuffix')"
        class="col"
        hide-bottom-space
        outlined
      />
      <CommittedInput
        v-model="scaleX"
        :disable="sceneObject.lock"
        :drag-step="unitlessStep"
        :label="t('axis.x')"
        :rules="scaleRules"
        :suffix="t('sceneObjectInspector.scaleSuffix')"
        class="col"
        hide-bottom-space
        outlined
      />
    </div>

    <div>
      <q-color
        v-model="sceneObject.color"
        :palette="STANDARD_COLORS"
        default-view="palette"
      />
    </div>
  </div>
</template>
