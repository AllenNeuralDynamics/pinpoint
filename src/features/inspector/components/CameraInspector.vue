<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import CommittedInput from "@/components/CommittedInput.vue";
import { useDragReorder } from "@/composable/useDragReorder";
import { useNumericTupleModel } from "@/composable/useNumericTupleModel";
import { useUnitLabels } from "@/composable/useUnitLabels";
import { useValidationRules } from "@/composable/useValidationRules";
import {
  getCameraOrbit,
  setCameraOrbit,
  useBabylonRuntimeService
} from "@/features/scene";
import {
  addCameraPose,
  buildCameraPose,
  type CameraPose,
  removeCameraPose,
  reorderCameraPose
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
const runtime = useBabylonRuntimeService();
const preferences = usePreferencesStore();
const unitLabels = useUnitLabels();
const { requiredName: nameRules, optionalNumber: numberRules } =
  useValidationRules();

const name = ref(t("cameraInspector.defaultPoseName"));
const orbit = ref<[number, number, number]>([0, 0, 0]);

// Declared next to orbit (the documented exception in AGENTS.md). Camera
// poses store raw radians/mm; display converts through the same preferences
// ProbeInspector's rotation/position fields use.
const alpha = useNumericTupleModel(
  () => orbit.value,
  0,
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);
const beta = useNumericTupleModel(
  () => orbit.value,
  1,
  radians => radiansToRotationUnit(radians, preferences.rotationUnit),
  value => rotationUnitToRadians(value, preferences.rotationUnit),
  () => preferences.decimalPrecision
);
const radius = useNumericTupleModel(
  () => orbit.value,
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

/**
 * Save the drafted orbit as a new named pose in the experiment.
 */
function savePose(): void {
  addCameraPose(
    currentExperiment.experiment,
    buildCameraPose(name.value, orbit.value)
  );
}

/**
 * Move the live camera to a saved pose's orbit.
 * @param pose Camera pose to apply.
 */
function applyPose(pose: CameraPose): void {
  const camera = runtime.camera.value;
  if (!camera) return;
  setCameraOrbit(camera, [pose.alpha, pose.beta, pose.radius]);
}

/**
 * Overwrite the draft with the scene camera's current orbit.
 */
function copyFromCurrentCamera(): void {
  const camera = runtime.camera.value;
  if (!camera) return;
  orbit.value = getCameraOrbit(camera);
}

onMounted(copyFromCurrentCamera);
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
    <CommittedInput
      v-model="name"
      :label="t('cameraInspector.poseName')"
      outlined
      :rules="nameRules"
    />
    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-model="alpha"
        class="col"
        :label="t('cameraInspector.alpha')"
        outlined
        :rules="numberRules"
        :suffix="rotationSuffix"
      />
      <CommittedInput
        v-model="beta"
        class="col"
        :label="t('cameraInspector.beta')"
        outlined
        :rules="numberRules"
        :suffix="rotationSuffix"
      />
      <CommittedInput
        v-model="radius"
        class="col"
        :label="t('cameraInspector.radius')"
        outlined
        :rules="numberRules"
        :suffix="positionSuffix"
      />
    </div>
    <q-btn
      :label="t('cameraInspector.copyFromCurrent')"
      @click="copyFromCurrentCamera"
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
