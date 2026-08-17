<script lang="ts" setup>
import { computed, toRaw } from "vue";
import { useI18n } from "vue-i18n";
import AxisOrderList from "./AxisOrderList.vue";
import GlobalAxisList from "./GlobalAxisList.vue";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { type AxisIndex, moveAxisSlot } from "@/utils/axis-order";
import {
  type AnatomicalDirection,
  getAxisDirections,
  getAxisDirectionsHandedness,
  getAxisDirectionsName,
  getDirectionLine,
  getLineAxisIndex,
  getRotationAxisMessageKey,
  type GlobalCoordinateSystem
} from "@/utils/coordinate-frame";

const currentExperimentStore = useCurrentExperimentStore();
const { t } = useI18n();

const system = computed(() => currentExperimentStore.globalCoordinateSystem);
const summary = computed(() => {
  const directions = currentExperimentStore.axisDirections;
  return t("preferences.coordinateSystemSummary", {
    name: getAxisDirectionsName(directions),
    handedness: t(
      getAxisDirectionsHandedness(directions) === "right"
        ? "preferences.handednessRight"
        : "preferences.handednessLeft"
    )
  });
});
const rotationLabels = computed(
  () =>
    system.value.axes.map(
      axis => axis.rotationName || t(getRotationAxisMessageKey(axis.direction))
    ) as [string, string, string]
);

/**
 * Edit a copy of the current system and hand it to the store, so the
 * experiment's geometry is re-expressed and the edit is one undo step.
 * @param edit Applies the edit to the copy.
 */
function updateSystem(edit: (system: GlobalCoordinateSystem) => void): void {
  const next = structuredClone(toRaw(system.value));
  edit(next);
  currentExperimentStore.setGlobalCoordinateSystem(next);
}

/**
 * Point one axis in a new direction, handing its old direction to whichever
 * axis already runs along the new direction's line so the system stays valid.
 * @param axis Axis to redirect.
 * @param direction Direction the axis's positive values point.
 */
function pickDirection(axis: AxisIndex, direction: AnatomicalDirection): void {
  updateSystem(next => {
    const parallel = getLineAxisIndex(
      getAxisDirections(next),
      getDirectionLine(direction)
    );
    next.axes[parallel].direction = next.axes[axis].direction;
    next.axes[axis].direction = direction;
  });
}

/**
 * Name positions along one axis.
 * @param axis Axis to name.
 * @param name User name, or empty to fall back to the built-in label.
 */
function renamePosition(axis: AxisIndex, name: string): void {
  updateSystem(next => {
    next.axes[axis].positionName = name;
  });
}

/**
 * Name rotations about one axis.
 * @param axis Axis to name.
 * @param name User name, or empty to fall back to the built-in label.
 */
function renameRotation(axis: AxisIndex, name: string): void {
  updateSystem(next => {
    next.axes[axis].rotationName = name;
  });
}

/**
 * Move one axis within the order position inputs are shown in.
 * @param fromSlot Slot the axis is shown in now.
 * @param toSlot Slot to show it in.
 */
function movePositionSlot(fromSlot: number, toSlot: number): void {
  updateSystem(next =>
    moveAxisSlot(next.positionDisplayOrder, fromSlot, toSlot)
  );
}

/**
 * Move one axis within the order rotation inputs are shown in.
 * @param fromSlot Slot the axis is shown in now.
 * @param toSlot Slot to show it in.
 */
function moveRotationSlot(fromSlot: number, toSlot: number): void {
  updateSystem(next =>
    moveAxisSlot(next.rotationDisplayOrder, fromSlot, toSlot)
  );
}
</script>

<template>
  <div>
    <div class="text-h6">
      {{ $t("preferences.globalCoordinateSystemTitle") }}
    </div>
    <div class="text-subtitle2">{{ summary }}</div>
    <div class="text-caption q-pb-sm">
      {{ $t("preferences.globalCoordinateSystemHint") }}
    </div>
    <div class="column q-gutter-y-md">
      <div>
        <div class="text-body2 q-pb-xs">{{ $t("preferences.globalAxes") }}</div>
        <GlobalAxisList
          :axes="system.axes"
          :order="system.positionDisplayOrder"
          @move="movePositionSlot"
          @pick-direction="pickDirection"
          @rename-position="renamePosition"
          @rename-rotation="renameRotation"
        />
      </div>
      <AxisOrderList
        :label="$t('preferences.rotationAxisOrder')"
        :labels="rotationLabels"
        :order="system.rotationDisplayOrder"
        @move="moveRotationSlot"
      />
    </div>
  </div>
</template>
