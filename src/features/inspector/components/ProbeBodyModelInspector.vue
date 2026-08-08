<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { SceneModel } from "@/features/scene";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
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

const {
  probeId,
  bodyModel,
  disable = false
} = defineProps<{
  probeId: string;
  bodyModel: SceneModel;
  disable?: boolean;
}>();

const currentExperiment = useCurrentExperimentStore();
const preferences = usePreferencesStore();
const unitLabels = useUnitLabels();
const { optionalNumber: numberRules, positiveNumber: scaleRules } =
  useValidationRules();
const { t } = useI18n();

const positionSuffix = computed(() =>
  unitLabels.position(preferences.positionUnit)
);

const rotationSuffix = computed(() =>
  unitLabels.rotation(preferences.rotationUnit)
);

const isGizmoAttached = computed(
  () => currentExperiment.bodyModelGizmoProbeId === probeId
);

const gizmoButtonLabel = computed(() =>
  isGizmoAttached.value
    ? t("probeInspector.detachBodyModelGizmo")
    : t("probeInspector.attachBodyModelGizmo")
);

const positionX = useNumericTupleModel(
  () => bodyModel.position,
  0,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);
const positionY = useNumericTupleModel(
  () => bodyModel.position,
  1,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);
const positionZ = useNumericTupleModel(
  () => bodyModel.position,
  2,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);

const rotationX = useNumericTupleModel(
  () => bodyModel.rotation,
  0,
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);
const rotationY = useNumericTupleModel(
  () => bodyModel.rotation,
  1,
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);
const rotationZ = useNumericTupleModel(
  () => bodyModel.rotation,
  2,
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);

const scaleX = useNumericTupleModel(
  () => bodyModel.scale,
  0,
  value => value,
  value => value,
  () => preferences.decimalPrecision
);
const scaleY = useNumericTupleModel(
  () => bodyModel.scale,
  1,
  value => value,
  value => value,
  () => preferences.decimalPrecision
);
const scaleZ = useNumericTupleModel(
  () => bodyModel.scale,
  2,
  value => value,
  value => value,
  () => preferences.decimalPrecision
);

/** Attach the transform gizmo to this probe's body model, or detach it again. */
function toggleGizmo() {
  currentExperiment.bodyModelGizmoProbeId = isGizmoAttached.value
    ? null
    : probeId;
}
</script>

<template>
  <!-- Plain wrapper: the parent inspector section is itself a `q-gutter-y-md`
       container, and its `> *` rule would override this column's negative top
       margin, doubling the gap above the first row. -->
  <div>
    <div class="column no-wrap q-gutter-y-md">
      <q-btn
        :aria-label="gizmoButtonLabel"
        :color="isGizmoAttached ? 'primary' : undefined"
        :disable="disable"
        icon="sym_o_drag_pan"
        :label="gizmoButtonLabel"
        @click="toggleGizmo"
      />
      <div class="row q-gutter-x-sm">
        <CommittedInput
          v-model="positionX"
          class="col"
          :disable="disable"
          hide-bottom-space
          :label="t('probeInspector.bodyModelPosition', { axis: t('axis.x') })"
          outlined
          :rules="numberRules"
          :suffix="positionSuffix"
        />
        <CommittedInput
          v-model="positionY"
          class="col"
          :disable="disable"
          hide-bottom-space
          :label="t('probeInspector.bodyModelPosition', { axis: t('axis.y') })"
          outlined
          :rules="numberRules"
          :suffix="positionSuffix"
        />
        <CommittedInput
          v-model="positionZ"
          class="col"
          :disable="disable"
          hide-bottom-space
          :label="t('probeInspector.bodyModelPosition', { axis: t('axis.z') })"
          outlined
          :rules="numberRules"
          :suffix="positionSuffix"
        />
      </div>

      <div class="row q-gutter-x-sm">
        <CommittedInput
          v-model="rotationX"
          class="col"
          :disable="disable"
          hide-bottom-space
          :label="t('probeInspector.bodyModelRotation', { axis: t('axis.x') })"
          outlined
          :rules="numberRules"
          :suffix="rotationSuffix"
        />
        <CommittedInput
          v-model="rotationY"
          class="col"
          :disable="disable"
          hide-bottom-space
          :label="t('probeInspector.bodyModelRotation', { axis: t('axis.y') })"
          outlined
          :rules="numberRules"
          :suffix="rotationSuffix"
        />
        <CommittedInput
          v-model="rotationZ"
          class="col"
          :disable="disable"
          hide-bottom-space
          :label="t('probeInspector.bodyModelRotation', { axis: t('axis.z') })"
          outlined
          :rules="numberRules"
          :suffix="rotationSuffix"
        />
      </div>

      <div class="row q-gutter-x-sm">
        <CommittedInput
          v-model="scaleX"
          class="col"
          :disable="disable"
          hide-bottom-space
          :label="t('probeInspector.bodyModelScale', { axis: t('axis.x') })"
          outlined
          :rules="scaleRules"
          :suffix="t('probeInspector.scaleSuffix')"
        />
        <CommittedInput
          v-model="scaleY"
          class="col"
          :disable="disable"
          hide-bottom-space
          :label="t('probeInspector.bodyModelScale', { axis: t('axis.y') })"
          outlined
          :rules="scaleRules"
          :suffix="t('probeInspector.scaleSuffix')"
        />
        <CommittedInput
          v-model="scaleZ"
          class="col"
          :disable="disable"
          hide-bottom-space
          :label="t('probeInspector.bodyModelScale', { axis: t('axis.z') })"
          outlined
          :rules="scaleRules"
          :suffix="t('probeInspector.scaleSuffix')"
        />
      </div>
    </div>
  </div>
</template>
