<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  STANDARD_COLORS,
  type SceneObject,
  toggleSceneObjectCollidable,
  toggleSceneObjectLock
} from "@/features/scene";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useNumericTupleModel } from "@/composable/useNumericTupleModel";
import { useUnitLabels } from "@/composable/useUnitLabels";
import { useValidationRules } from "@/composable/useValidationRules";
import CommittedInput from "@/components/CommittedInput.vue";
import {
  millimetersToPositionUnit,
  positionUnitToMillimeters,
  radiansToRotationUnit,
  rotationUnitToRadians
} from "@/utils/math";

const { sceneObject } = defineProps<{
  sceneObject: SceneObject;
}>();

const preferences = usePreferencesStore();
const unitLabels = useUnitLabels();
const {
  requiredName: nameRules,
  optionalNumber: numberRules,
  positiveNumber: scaleRules
} = useValidationRules();
const { t } = useI18n();

const positionSuffix = computed(() =>
  unitLabels.position(preferences.positionUnit)
);

const rotationSuffix = computed(() =>
  unitLabels.rotation(preferences.rotationUnit)
);

const name = computed({
  get: () => sceneObject.name,
  set: (value: string) => (sceneObject.name = value.trim())
});

const ap = useNumericTupleModel(
  () => sceneObject.position,
  0,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);
const dv = useNumericTupleModel(
  () => sceneObject.position,
  1,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);
const ml = useNumericTupleModel(
  () => sceneObject.position,
  2,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);

const roll = useNumericTupleModel(
  () => sceneObject.rotation,
  0,
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);
const yaw = useNumericTupleModel(
  () => sceneObject.rotation,
  1,
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);
const pitch = useNumericTupleModel(
  () => sceneObject.rotation,
  2,
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);

const scaleAp = useNumericTupleModel(
  () => sceneObject.scale,
  0,
  value => value,
  value => value,
  () => preferences.decimalPrecision
);
const scaleDv = useNumericTupleModel(
  () => sceneObject.scale,
  1,
  value => value,
  value => value,
  () => preferences.decimalPrecision
);
const scaleMl = useNumericTupleModel(
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
    <q-btn
      :aria-label="lockLabel"
      class="full-width"
      :color="lockColor"
      :icon="lockIcon"
      :label="lockLabel"
      @click="toggleSceneObjectLock(sceneObject)"
    >
      <q-tooltip>{{ lockLabel }}</q-tooltip>
    </q-btn>

    <q-toggle
      :label="t('sceneObjectInspector.collisionDetection')"
      :model-value="sceneObject.collidable"
      @update:model-value="toggleSceneObjectCollidable(sceneObject)"
    />

    <CommittedInput
      v-model="name"
      :label="t('sceneObjectInspector.name')"
      outlined
      :rules="nameRules"
    />

    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-model="ap"
        :disable="sceneObject.lock"
        :label="t('axis.ap')"
        :rules="numberRules"
        :suffix="positionSuffix"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="dv"
        :disable="sceneObject.lock"
        :label="t('axis.dv')"
        :rules="numberRules"
        :suffix="positionSuffix"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="ml"
        :disable="sceneObject.lock"
        :label="t('axis.ml')"
        :rules="numberRules"
        :suffix="positionSuffix"
        class="col"
        outlined
      />
    </div>

    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-model="roll"
        :disable="sceneObject.lock"
        :label="t('sceneObjectInspector.roll')"
        :rules="numberRules"
        :suffix="rotationSuffix"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="yaw"
        :disable="sceneObject.lock"
        :label="t('sceneObjectInspector.yaw')"
        :rules="numberRules"
        :suffix="rotationSuffix"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="pitch"
        :disable="sceneObject.lock"
        :label="t('sceneObjectInspector.pitch')"
        :rules="numberRules"
        :suffix="rotationSuffix"
        class="col"
        outlined
      />
    </div>

    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-model="scaleAp"
        :disable="sceneObject.lock"
        :label="t('axis.ap')"
        :rules="scaleRules"
        :suffix="t('sceneObjectInspector.scaleSuffix')"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="scaleDv"
        :disable="sceneObject.lock"
        :label="t('axis.dv')"
        :rules="scaleRules"
        :suffix="t('sceneObjectInspector.scaleSuffix')"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="scaleMl"
        :disable="sceneObject.lock"
        :label="t('axis.ml')"
        :rules="scaleRules"
        :suffix="t('sceneObjectInspector.scaleSuffix')"
        class="col"
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
