<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  type CoordinateSystemNode,
  type CoordinateSystemNodeComponent,
  getCoordinateSystemSlots,
  reorderCoordinateSystemSlot,
  setCoordinateSystemSlotAxis
} from "@/features/coordinate-system";
import { useDragReorder } from "@/composable/useDragReorder";
import CoordinateSystemNumericInput from "./CoordinateSystemNumericInput.vue";
import CoordinateSystemValueInspector from "./CoordinateSystemValueInspector.vue";

const { node, component, label } = defineProps<{
  node: CoordinateSystemNode;
  component: CoordinateSystemNodeComponent;
  label: string;
}>();
const isOpen = defineModel<boolean>({ required: true });

const { t } = useI18n();
const {
  draggedIndex,
  dropTargetIndex,
  startDrag,
  dragOverRow,
  dropRow,
  endDrag
} = useDragReorder((fromIndex, toIndex) =>
  reorderCoordinateSystemSlot(node, component, fromIndex, toIndex)
);

const hasAnatomicalInputs = computed(
  () => component === "rotation" && node.rotationInput === "anatomical"
);
const slots = computed(() => getCoordinateSystemSlots(node, component));
</script>

<template>
  <q-dialog v-model="isOpen">
    <q-card class="fixed-dialog-card">
      <q-card-section>
        <div class="text-h6">{{ label }}</div>
        <div class="text-caption">{{ node.name }}</div>
      </q-card-section>
      <q-card-section>
        <div class="row no-wrap q-gutter-x-sm">
          <div
            v-for="(slot, index) of slots"
            :key="slot.axis"
            class="col value-column"
            :class="{
              'value-column--dragging': draggedIndex === index,
              'value-column--drop-target':
                dropTargetIndex === index && draggedIndex !== index
            }"
            @dragover="dragOverRow(index, $event)"
            @drop="dropRow(index)"
          >
            <div
              v-if="!hasAnatomicalInputs"
              class="value-column__handle"
              draggable="true"
              :title="t('coordinateSystemInspector.dragToReorder')"
              @dragend="endDrag"
              @dragstart.stop="startDrag(index, $event)"
            >
              <q-icon name="drag_indicator" size="sm" />
            </div>
            <CoordinateSystemNumericInput
              v-if="hasAnatomicalInputs"
              :entry="slot.value"
              component="rotation"
              :label="slot.value.name"
            />
            <CoordinateSystemValueInspector
              v-else
              :axis-index="slot.axis"
              :component="component"
              :coordinate-system-value="slot.value"
              @update:axis-index="
                setCoordinateSystemSlotAxis(node, component, index, $event)
              "
            />
          </div>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          color="primary"
          :label="t('coordinateSystemInspector.closeValues')"
          @click="isOpen = false"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.value-column__handle
  cursor: grab
  display: flex
  justify-content: center

.value-column--dragging
  opacity: 0.5

.value-column--drop-target
  outline: 2px solid var(--q-primary)
  outline-offset: -2px
</style>
