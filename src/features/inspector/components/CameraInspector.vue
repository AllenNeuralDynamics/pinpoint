<script lang="ts" setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import CommittedInput from "@/components/CommittedInput.vue";
import { useDragReorder } from "@/composable/useDragReorder";
import { useNumericModel } from "@/composable/useNumericModel";
import { useNumericTupleModel } from "@/composable/useNumericTupleModel";
import { useUnitLabels } from "@/composable/useUnitLabels";
import { useValidationRules } from "@/composable/useValidationRules";
import {
  addCameraPose,
  type CameraPose,
  copyCameraPose,
  removeCameraPose,
  reorderCameraPose,
  setCameraPose
} from "@/features/experiment";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import {
  millimetersToPositionUnit,
  positionUnitToMillimeters,
  radiansToRotationUnit,
  rotationUnitToRadians
} from "@/utils/math";

const { t } = useI18n();
const currentExperiment = useCurrentExperimentStore();
const preferences = usePreferencesStore();
const unitLabels = useUnitLabels();
const { requiredName: nameRules, optionalNumber: numberRules } =
  useValidationRules();
const {
  draggedIndex,
  dropTargetIndex,
  startDrag,
  dragOverRow,
  dropRow,
  endDrag
} = useDragReorder((fromIndex, toIndex) =>
  reorderCameraPose(currentExperiment.experiment, fromIndex, toIndex)
);

const name = ref(t("cameraInspector.defaultPoseName"));

const pose = computed(() => currentExperiment.cameraPose);

const alpha = useNumericModel(
  () => pose.value.alpha,
  value => (pose.value.alpha = value),
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);
const beta = useNumericModel(
  () => pose.value.beta,
  value => (pose.value.beta = value),
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);
const radius = useNumericModel(
  () => pose.value.radius,
  value => (pose.value.radius = value),
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);
const targetAp = useNumericTupleModel(
  () => pose.value.target,
  0,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);
const targetDv = useNumericTupleModel(
  () => pose.value.target,
  1,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);
const targetMl = useNumericTupleModel(
  () => pose.value.target,
  2,
  millimeters =>
    millimetersToPositionUnit(millimeters, preferences.positionUnit),
  value => positionUnitToMillimeters(value, preferences.positionUnit),
  () => preferences.decimalPrecision
);

const rotationSuffix = computed(() =>
  unitLabels.rotation(preferences.rotationUnit)
);
const positionSuffix = computed(() =>
  unitLabels.position(preferences.positionUnit)
);

/**
 * Save the live camera pose to the library under the typed name.
 */
function savePose(): void {
  addCameraPose(
    currentExperiment.experiment,
    copyCameraPose(pose.value, name.value)
  );
}

/**
 * Move the live camera to a saved pose's orbit and target.
 * @param savedPose Camera pose to apply.
 */
function applyPose(savedPose: CameraPose): void {
  setCameraPose(
    pose.value,
    [savedPose.alpha, savedPose.beta, savedPose.radius],
    savedPose.target
  );
}
</script>

<template>
  <div class="column q-gutter-y-md">
    <q-btn-toggle
      v-model="preferences.cameraProjection"
      :aria-label="t('cameraInspector.projection')"
      :options="[
        { label: t('cameraInspector.perspective'), value: 'perspective' },
        { label: t('cameraInspector.orthographic'), value: 'orthographic' }
      ]"
      spread
      toggle-color="primary"
    />
    <div>
      <div class="text-body2 q-pb-xs">{{ t("cameraInspector.orbit") }}</div>
      <div class="row q-gutter-x-sm">
        <CommittedInput
          v-model="alpha"
          class="col"
          hide-bottom-space
          :label="t('cameraInspector.alpha')"
          outlined
          :rules="numberRules"
          :suffix="rotationSuffix"
        />
        <CommittedInput
          v-model="beta"
          class="col"
          hide-bottom-space
          :label="t('cameraInspector.beta')"
          outlined
          :rules="numberRules"
          :suffix="rotationSuffix"
        />
        <CommittedInput
          v-model="radius"
          class="col"
          hide-bottom-space
          :label="t('cameraInspector.radius')"
          outlined
          :rules="numberRules"
          :suffix="positionSuffix"
        />
      </div>
    </div>
    <div>
      <div class="text-body2 q-pb-xs">{{ t("cameraInspector.target") }}</div>
      <div class="row q-gutter-x-sm">
        <CommittedInput
          v-model="targetAp"
          class="col"
          hide-bottom-space
          :label="t('axis.ap')"
          outlined
          :rules="numberRules"
          :suffix="positionSuffix"
        />
        <CommittedInput
          v-model="targetDv"
          class="col"
          hide-bottom-space
          :label="t('axis.dv')"
          outlined
          :rules="numberRules"
          :suffix="positionSuffix"
        />
        <CommittedInput
          v-model="targetMl"
          class="col"
          hide-bottom-space
          :label="t('axis.ml')"
          outlined
          :rules="numberRules"
          :suffix="positionSuffix"
        />
      </div>
    </div>
    <q-separator />
    <div class="text-body2">{{ t("cameraInspector.poses") }}</div>
    <CommittedInput
      v-model="name"
      :label="t('cameraInspector.poseName')"
      hide-bottom-space
      outlined
      :rules="nameRules"
    />
    <q-btn
      color="primary"
      icon="save"
      :label="t('cameraInspector.savePose')"
      @click="savePose"
    />
    <div v-if="!currentExperiment.cameraPoses.length" class="text-weight-light">
      <i>{{ t("cameraInspector.noPoses") }}</i>
    </div>
    <q-list v-else class="pose-list" separator>
      <q-item
        v-for="(pose, index) of currentExperiment.cameraPoses"
        :key="pose.id"
        v-ripple
        :aria-label="t('cameraInspector.applyPose', { name: pose.name })"
        :class="{
          'pose-row--dragging': draggedIndex === index,
          'pose-row--drop-target':
            dropTargetIndex === index && draggedIndex !== index
        }"
        clickable
        @click="applyPose(pose)"
        @dragover="dragOverRow(index, $event)"
        @drop="dropRow(index)"
      >
        <q-item-section side>
          <div
            class="pose-row__handle"
            draggable="true"
            :title="t('cameraInspector.dragToReorder')"
            @dragend="endDrag"
            @dragstart.stop="startDrag(index, $event)"
          >
            <q-icon name="drag_indicator" size="sm" />
          </div>
        </q-item-section>
        <q-item-section>{{ pose.name }}</q-item-section>
        <q-item-section side>
          <q-btn
            :aria-label="t('cameraInspector.deletePose')"
            flat
            icon="delete"
            round
            @click.stop="removeCameraPose(currentExperiment.experiment, pose)"
          />
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<style lang="sass" scoped>
.pose-row__handle
  cursor: grab
  display: flex

.pose-row--dragging
  opacity: 0.5

.pose-row--drop-target
  outline: 2px solid var(--q-primary)
  outline-offset: -2px
</style>
