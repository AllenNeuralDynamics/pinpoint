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
import { useCoordinateAxes } from "@/composable/useCoordinateAxes";
import { useDragSteps } from "@/composable/useDragSteps";
import { useNumericTupleModel } from "@/composable/useNumericTupleModel";
import { useValidationRules } from "@/composable/useValidationRules";
import CoordinateAxisInputs from "@/components/CoordinateAxisInputs.vue";
import CommittedInput from "@/components/CommittedInput.vue";

const { sceneObject } = defineProps<{
  sceneObject: SceneObject;
}>();

const currentExperimentStore = useCurrentExperimentStore();
const preferences = usePreferencesStore();
const coordinateAxes = useCoordinateAxes();
const { unitlessStep } = useDragSteps();
const { requiredName: nameRules, positiveNumber: scaleRules } =
  useValidationRules();
const { t } = useI18n();

/** Whether the position fields display the position offset by the reference coordinate. */
const isPositionRelativeToReference = ref(false);

const name = computed({
  get: () => sceneObject.name,
  set: (value: string) => (sceneObject.name = value.trim())
});

/**
 * Reference coordinate to subtract from, and add back to, the position when the
 * toggle is on, else zero; both are in the experiment's global coordinate system.
 */
const positionOffset = computed<[number, number, number]>(() =>
  isPositionRelativeToReference.value
    ? currentExperimentStore.referenceCoordinate
    : [0, 0, 0]
);

// A scale is an axis-wise magnitude along the same global coordinate system
// axes as the position, so each field keeps its own axis's slot.
const scaleModels = ([0, 1, 2] as const).map(axis =>
  useNumericTupleModel(
    () => sceneObject.scale,
    axis,
    value => value,
    value => value,
    () => preferences.decimalPrecision
  )
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

    <CoordinateAxisInputs
      :disable="sceneObject.lock"
      hide-bottom-space
      kind="position"
      :offset="positionOffset"
      outlined
      :tuple="sceneObject.position"
    />

    <CoordinateAxisInputs
      :disable="sceneObject.lock"
      hide-bottom-space
      kind="rotation"
      outlined
      :tuple="sceneObject.rotation"
    />

    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-for="slot of coordinateAxes.position.value"
        :key="slot.axis"
        v-model="scaleModels[slot.axis]!.value"
        :disable="sceneObject.lock"
        :drag-step="unitlessStep"
        :label="t('sceneObjectInspector.scaleAxis', { axis: slot.label })"
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
