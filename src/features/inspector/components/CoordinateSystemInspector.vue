<script lang="ts" setup>
import { computed, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  addCoordinateSystemTransform,
  type CoordinateSystem,
  removeCoordinateSystemTransform,
  reorderCoordinateSystemTransform,
  setCoordinateSystemSurfaceNode
} from "@/features/coordinate-system";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useDragReorder } from "@/composable/useDragReorder";
import { useValidationRules } from "@/composable/useValidationRules";
import CommittedInput from "@/components/CommittedInput.vue";
import CoordinateSystemNodeInspector from "./CoordinateSystemNodeInspector.vue";

const { coordinateSystem } = defineProps<{
  coordinateSystem: CoordinateSystem;
}>();

const currentExperiment = useCurrentExperimentStore();

const { requiredName: nameRules } = useValidationRules();
const { t } = useI18n();
const {
  draggedIndex,
  dropTargetIndex,
  startDrag,
  dragOverRow,
  dropRow,
  endDrag
} = useDragReorder(reorderTransform);

const name = computed({
  get: () => coordinateSystem.name,
  set: (value: string) => (coordinateSystem.name = value.trim())
});

/**
 * Move a transform within the chain, dropping the focused-node highlight so it never
 * points at a node that has moved.
 * @param fromIndex Index of the transform to move.
 * @param toIndex Index to move it to.
 */
function reorderTransform(fromIndex: number, toIndex: number) {
  reorderCoordinateSystemTransform(coordinateSystem, fromIndex, toIndex);
  currentExperiment.focusedCoordinateSystemNodeIndex = null;
}

/**
 * Remove a transform from the chain, dropping the focused-node highlight.
 * @param nodeIndex Index of the transform to remove.
 */
function removeTransform(nodeIndex: number) {
  removeCoordinateSystemTransform(coordinateSystem, nodeIndex);
  currentExperiment.focusedCoordinateSystemNodeIndex = null;
}

watch(
  () => coordinateSystem.id,
  () => {
    currentExperiment.focusedCoordinateSystemNodeIndex = null;
  }
);

onUnmounted(() => {
  currentExperiment.focusedCoordinateSystemNodeIndex = null;
});
</script>

<template>
  <div class="column full-height coordinate-system-inspector">
    <CommittedInput
      v-model="name"
      hide-bottom-space
      :label="t('coordinateSystemInspector.name')"
      outlined
      :rules="nameRules"
    />
    <q-toggle
      v-model="coordinateSystem.offsetByReferenceCoordinate"
      :label="t('coordinateSystemInspector.offsetByReferenceCoordinate')"
    />
    <q-btn
      class="full-width"
      color="primary"
      icon="add"
      :label="t('coordinateSystemInspector.addTransform')"
      @click="
        addCoordinateSystemTransform(
          coordinateSystem,
          t('coordinateSystemInspector.newTransformName', {
            index: coordinateSystem.chain.length + 1
          })
        )
      "
    />
    <q-list class="col scroll" separator>
      <CoordinateSystemNodeInspector
        v-for="(node, index) of coordinateSystem.chain"
        :key="index"
        :class="{
          'node-row--dragging': draggedIndex === index,
          'node-row--drop-target':
            dropTargetIndex === index && draggedIndex !== index
        }"
        :node="node"
        @delete="removeTransform(index)"
        @drag-end="endDrag"
        @drag-start="startDrag(index, $event)"
        @dragover="dragOverRow(index, $event)"
        @drop="dropRow(index)"
        @focus="currentExperiment.focusedCoordinateSystemNodeIndex = index"
        @update:on-surface="
          setCoordinateSystemSurfaceNode(coordinateSystem, index, $event)
        "
      />
    </q-list>
  </div>
</template>

<style lang="sass" scoped>
// `gap`, not `q-gutter-y-md`: the gutter class spaces children with a negative
// margin on the parent, which cancels out when a child is itself a gutter
// container. Matches ProbeInspector's `&__section` spacing (see its style block
// for the `flex-wrap: nowrap` rationale).
.coordinate-system-inspector
  flex-wrap: nowrap
  gap: 16px
  padding: 8px 0

.node-row--dragging
  opacity: 0.5

.node-row--drop-target
  outline: 2px solid var(--q-primary)
  outline-offset: -2px
</style>
