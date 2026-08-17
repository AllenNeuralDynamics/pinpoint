<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useDragReorder } from "@/composable/useDragReorder";
import type { AxisOrder } from "@/utils/axis-order";

const { labels, order } = defineProps<{
  /** Heading shown above the list. */
  label: string;
  /** Label of each axis, indexed by axis. */
  labels: [string, string, string];
  /** Order the rows are shown in, as display slot -> axis index. */
  order: AxisOrder;
}>();
const emit = defineEmits<{ move: [fromSlot: number, toSlot: number] }>();

const { t } = useI18n();
const {
  draggedIndex,
  dropTargetIndex,
  startDrag,
  dragOverRow,
  dropRow,
  endDrag
} = useDragReorder((fromSlot, toSlot) => emit("move", fromSlot, toSlot));

const slots = computed(() =>
  order.map(axis => ({ axis, label: labels[axis] }))
);
</script>

<template>
  <div>
    <div class="text-body2 q-pb-xs">{{ label }}</div>
    <q-list separator>
      <q-item
        v-for="(slot, index) of slots"
        :key="slot.axis"
        :class="{
          'order-row--dragging': draggedIndex === index,
          'order-row--drop-target':
            dropTargetIndex === index && draggedIndex !== index
        }"
        @dragover="dragOverRow(index, $event)"
        @drop="dropRow(index)"
      >
        <q-item-section side>
          <div
            class="order-row__handle"
            draggable="true"
            :title="t('preferences.dragToReorder')"
            @dragend="endDrag"
            @dragstart.stop="startDrag(index, $event)"
          >
            <q-icon name="drag_indicator" size="sm" />
          </div>
        </q-item-section>
        <q-item-section>{{ slot.label }}</q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<style lang="sass" scoped>
.order-row__handle
  cursor: grab
  display: flex

.order-row--dragging
  opacity: 0.5

.order-row--drop-target
  outline: 2px solid var(--q-primary)
  outline-offset: -2px
</style>
