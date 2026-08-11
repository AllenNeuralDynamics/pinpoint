<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useDragReorder } from "@/composable/useDragReorder";
import { getAxisSlots, moveAxisSlot, type AxisOrder } from "@/utils/axis-order";

const { names, order, defaultNames } = defineProps<{
  /** Heading shown above the list. */
  label: string;
  /** Per-axis user names, indexed by axis, mutated in place. */
  names: [string, string, string];
  /** Display slot order, mutated in place. */
  order: AxisOrder;
  /** Per-axis built-in labels, indexed by axis. */
  defaultNames: [string, string, string];
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
  moveAxisSlot(order, fromIndex, toIndex)
);

const slots = computed(() => getAxisSlots(order, names, defaultNames));
</script>

<template>
  <div>
    <div class="text-body2 q-pb-xs">{{ label }}</div>
    <q-list separator>
      <q-item
        v-for="(slot, index) of slots"
        :key="slot.axis"
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
            :title="t('preferences.dragToReorder')"
            @dragend="endDrag"
            @dragstart.stop="startDrag(index, $event)"
          >
            <q-icon name="drag_indicator" size="sm" />
          </div>
        </q-item-section>
        <q-item-section>
          <q-input
            :aria-label="
              t('preferences.axisName', { axis: defaultNames[slot.axis] })
            "
            dense
            :label="defaultNames[slot.axis]"
            :model-value="names[slot.axis]"
            outlined
            :rules="[]"
            @update:model-value="names[slot.axis] = String($event).trim()"
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
