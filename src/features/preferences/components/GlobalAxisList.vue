<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import DirectionSelect from "./DirectionSelect.vue";
import { useDragReorder } from "@/composable/useDragReorder";
import type { AxisIndex, AxisOrder } from "@/utils/axis-order";
import {
  type AnatomicalDirection,
  type GlobalCoordinateSystem,
  getPositionAxisMessageKey,
  getRotationAxisMessageKey
} from "@/utils/coordinate-frame";

const { axes, order } = defineProps<{
  /** Axes of the coordinate system being edited. */
  axes: GlobalCoordinateSystem["axes"];
  /** Order the rows are shown in, as display slot -> axis index. */
  order: AxisOrder;
}>();
const emit = defineEmits<{
  pickDirection: [axis: AxisIndex, direction: AnatomicalDirection];
  renamePosition: [axis: AxisIndex, name: string];
  renameRotation: [axis: AxisIndex, name: string];
  move: [fromSlot: number, toSlot: number];
}>();

const { t } = useI18n();
const {
  draggedIndex,
  dropTargetIndex,
  startDrag,
  dragOverRow,
  dropRow,
  endDrag
} = useDragReorder((fromSlot, toSlot) => emit("move", fromSlot, toSlot));

const rows = computed(() =>
  order.map(axis => ({
    axis,
    positionLabel: t(getPositionAxisMessageKey(axes[axis].direction)),
    rotationLabel: t(getRotationAxisMessageKey(axes[axis].direction))
  }))
);
</script>

<template>
  <q-list separator>
    <q-item
      v-for="(row, slot) of rows"
      :key="row.axis"
      :class="{
        'axis-row--dragging': draggedIndex === slot,
        'axis-row--drop-target':
          dropTargetIndex === slot && draggedIndex !== slot
      }"
      @dragover="dragOverRow(slot, $event)"
      @drop="dropRow(slot)"
    >
      <q-item-section side>
        <div
          class="axis-row__handle"
          draggable="true"
          :title="t('preferences.dragToReorder')"
          @dragend="endDrag"
          @dragstart.stop="startDrag(slot, $event)"
        >
          <q-icon name="drag_indicator" size="sm" />
        </div>
      </q-item-section>
      <q-item-section>
        <div class="row q-col-gutter-sm">
          <DirectionSelect
            :aria-label="
              t('preferences.axisDirectionFor', { axis: row.positionLabel })
            "
            class="col-12 col-sm-5"
            :label="t('preferences.axisDirection')"
            :model-value="axes[row.axis].direction"
            @update:model-value="emit('pickDirection', row.axis, $event)"
          />
          <q-input
            :aria-label="
              t('preferences.positionAxisName', { axis: row.positionLabel })
            "
            class="col-6 col-sm"
            dense
            :label="row.positionLabel"
            :model-value="axes[row.axis].positionName"
            outlined
            :rules="[]"
            @update:model-value="
              emit('renamePosition', row.axis, String($event).trim())
            "
          />
          <q-input
            :aria-label="
              t('preferences.rotationAxisName', { axis: row.rotationLabel })
            "
            class="col-6 col-sm"
            dense
            :label="row.rotationLabel"
            :model-value="axes[row.axis].rotationName"
            outlined
            :rules="[]"
            @update:model-value="
              emit('renameRotation', row.axis, String($event).trim())
            "
          />
        </div>
      </q-item-section>
    </q-item>
  </q-list>
</template>

<style lang="sass" scoped>
.axis-row__handle
  cursor: grab
  display: flex

.axis-row--dragging
  opacity: 0.5

.axis-row--drop-target
  outline: 2px solid var(--q-primary)
  outline-offset: -2px
</style>
