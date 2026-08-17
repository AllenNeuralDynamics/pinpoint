<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import DirectionSelect from "./DirectionSelect.vue";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  type AnatomicalDirection,
  getDirectionLine,
  getDirectionMessageKey,
  getRightDirection
} from "@/utils/coordinate-frame";

const currentExperimentStore = useCurrentExperimentStore();
const { t } = useI18n();

const system = computed(() => currentExperimentStore.localCoordinateSystem);
const rightLabel = computed(() => {
  const right = getRightDirection(system.value);
  return right ? t(getDirectionMessageKey(right)) : "";
});

/**
 * Point the probe's depth axis in a new direction, swapping with the forward
 * axis when that would leave the two parallel.
 * @param direction Direction the probe advances as it is inserted.
 */
function pickDepth(direction: AnatomicalDirection): void {
  const { depthDirection, forwardDirection } = system.value;
  currentExperimentStore.setLocalCoordinateSystem({
    depthDirection: direction,
    forwardDirection:
      getDirectionLine(direction) === getDirectionLine(forwardDirection)
        ? depthDirection
        : forwardDirection
  });
}

/**
 * Point the probe's forward axis in a new direction, swapping with the depth
 * axis when that would leave the two parallel.
 * @param direction Direction the electrodes face.
 */
function pickForward(direction: AnatomicalDirection): void {
  const { depthDirection, forwardDirection } = system.value;
  currentExperimentStore.setLocalCoordinateSystem({
    depthDirection:
      getDirectionLine(direction) === getDirectionLine(depthDirection)
        ? forwardDirection
        : depthDirection,
    forwardDirection: direction
  });
}
</script>

<template>
  <div>
    <div class="text-h6">
      {{ $t("preferences.localCoordinateSystemTitle") }}
    </div>
    <div class="text-caption q-pb-sm">
      {{ $t("preferences.localCoordinateSystemHint") }}
    </div>
    <div class="row q-col-gutter-sm">
      <DirectionSelect
        class="col-12 col-sm-5"
        :label="$t('axis.depth')"
        :model-value="system.depthDirection"
        @update:model-value="pickDepth"
      />
      <DirectionSelect
        class="col-12 col-sm-4"
        :label="$t('axis.forward')"
        :model-value="system.forwardDirection"
        @update:model-value="pickForward"
      />
      <q-input
        :aria-label="$t('axis.right')"
        class="col-12 col-sm-3"
        dense
        :label="$t('axis.right')"
        :model-value="rightLabel"
        outlined
        readonly
      />
    </div>
  </div>
</template>
