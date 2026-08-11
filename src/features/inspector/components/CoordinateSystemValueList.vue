<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  type CoordinateSystemNode,
  type CoordinateSystemNodeComponent,
  getCoordinateSystemValueAxis,
  reorderCoordinateSystemValue,
  setCoordinateSystemValueAxis
} from "@/features/coordinate-system";
import { useDragReorder } from "@/composable/useDragReorder";
import CoordinateSystemValueInspector from "./CoordinateSystemValueInspector.vue";

const { node, component, label } = defineProps<{
  node: CoordinateSystemNode;
  component: CoordinateSystemNodeComponent;
  label: string;
}>();

const { t } = useI18n();
const {
  draggedIndex,
  dropTargetIndex,
  startDrag,
  dragOverRow,
  dropRow,
  endDrag
} = useDragReorder((fromIndex, toIndex) =>
  reorderCoordinateSystemValue(node, component, fromIndex, toIndex)
);

const values = computed(() =>
  component === "position" ? node.position : node.rotation
);
</script>

<template>
  <div>
    <div class="text-body2 q-pb-xs">{{ label }}</div>
    <q-list separator>
      <q-item
        v-for="(coordinateSystemValue, index) of values"
        :key="index"
        :class="{
          'value-row--dragging': draggedIndex === index,
          'value-row--drop-target':
            dropTargetIndex === index && draggedIndex !== index
        }"
        @dragover="dragOverRow(index, $event)"
        @drop="dropRow(index)"
      >
        <q-item-section side>
          <div
            class="value-row__handle"
            draggable="true"
            :title="t('coordinateSystemInspector.dragToReorder')"
            @dragend="endDrag"
            @dragstart.stop="startDrag(index, $event)"
          >
            <q-icon name="drag_indicator" size="sm" />
          </div>
        </q-item-section>
        <q-item-section>
          <CoordinateSystemValueInspector
            :axis-index="getCoordinateSystemValueAxis(node, component, index)"
            :component="component"
            :coordinate-system-value="coordinateSystemValue"
            @update:axis-index="
              setCoordinateSystemValueAxis(node, component, index, $event)
            "
          />
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<style lang="sass" scoped>
.value-row__handle
  cursor: grab
  display: flex

.value-row--dragging
  opacity: 0.5

.value-row--drop-target
  outline: 2px solid var(--q-primary)
  outline-offset: -2px
</style>
