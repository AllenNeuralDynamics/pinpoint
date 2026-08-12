<script lang="ts" setup>
import { useDialogPluginComponent, useQuasar } from "quasar";
import { useI18n } from "vue-i18n";
import type { CoordinateSystem } from "../model/coordinate-system.model";
import {
  addCoordinateSystemTransform,
  buildCoordinateSystem
} from "../api/coordinate-system.api";
import { useCoordinateSystemLibraryStore } from "@/stores/coordinate-system-library.store";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useDragReorder } from "@/composable/useDragReorder";

defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();

const $q = useQuasar();
const { t } = useI18n();
const coordinateSystemLibraryStore = useCoordinateSystemLibraryStore();
const currentExperimentStore = useCurrentExperimentStore();

const {
  draggedIndex,
  dropTargetIndex,
  startDrag,
  dragOverRow,
  dropRow,
  endDrag
} = useDragReorder(coordinateSystemLibraryStore.reorder);

/**
 * Select a coordinate system for the inspector and close the library.
 * @param coordinateSystem Coordinate system to inspect.
 */
function openInInspector(coordinateSystem: CoordinateSystem) {
  currentExperimentStore.selectedInspectable = coordinateSystem;
  onDialogOK();
}

/**
 * Create a coordinate system seeded with one adjustable transform, add it to the library,
 * and open it in the inspector.
 */
function addCoordinateSystem() {
  const coordinateSystem = buildCoordinateSystem(
    t("coordinateSystemLibrary.newCoordinateSystemName", {
      index: coordinateSystemLibraryStore.library.length + 1
    }),
    [],
    true
  );
  addCoordinateSystemTransform(
    coordinateSystem,
    t("coordinateSystemInspector.newTransformName", { index: 1 })
  );
  coordinateSystemLibraryStore.add(coordinateSystem);
  openInInspector(coordinateSystem);
}

/**
 * Confirm, then remove the coordinate system from the library.
 * @param coordinateSystem Coordinate system to remove.
 */
function confirmRemove(coordinateSystem: CoordinateSystem) {
  $q.dialog({
    title: t("coordinateSystemLibrary.confirmDeleteTitle"),
    message: t("coordinateSystemLibrary.confirmDelete", {
      name: coordinateSystem.name
    }),
    cancel: true,
    persistent: true,
    ok: { label: t("coordinateSystemLibrary.delete"), color: "negative" }
  }).onOk(() => {
    if (currentExperimentStore.isInspectableSelected(coordinateSystem)) {
      currentExperimentStore.selectedInspectable = null;
    }
    coordinateSystemLibraryStore.remove(coordinateSystem);
  });
}
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card>
      <q-card-section>
        <div class="text-h5">{{ $t("coordinateSystemLibrary.title") }}</div>
        <div class="text-caption">
          {{ $t("coordinateSystemLibrary.clickToInspectHint") }}
        </div>
      </q-card-section>
      <q-card-section>
        <q-btn
          class="full-width"
          color="primary"
          icon="add"
          :label="$t('coordinateSystemLibrary.addCoordinateSystem')"
          @click="addCoordinateSystem"
        />
      </q-card-section>
      <q-card-section>
        <q-list class="dynamic-dialog-list" separator>
          <q-item
            v-for="(
              coordinateSystem, index
            ) in coordinateSystemLibraryStore.library"
            :key="coordinateSystem.id"
            clickable
            v-ripple
            :class="{
              'coordinate-system-row--dragging': draggedIndex === index,
              'coordinate-system-row--drop-target':
                dropTargetIndex === index && draggedIndex !== index
            }"
            @click="openInInspector(coordinateSystem)"
            @dragover="dragOverRow(index, $event)"
            @drop="dropRow(index)"
          >
            <q-item-section side>
              <div
                class="coordinate-system-row__handle"
                draggable="true"
                :title="t('coordinateSystemLibrary.dragToReorder')"
                @dragend="endDrag"
                @dragstart.stop="startDrag(index, $event)"
              >
                <q-icon name="drag_indicator" size="sm" />
              </div>
            </q-item-section>
            <q-item-section>{{ coordinateSystem.name }}</q-item-section>
            <q-item-section side>
              <q-btn
                :aria-label="
                  t('coordinateSystemLibrary.deleteCoordinateSystem', {
                    name: coordinateSystem.name
                  })
                "
                flat
                icon="delete"
                round
                @click.stop="confirmRemove(coordinateSystem)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          color="primary"
          :label="$t('coordinateSystemLibrary.close')"
          @click="onDialogOK"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.coordinate-system-row__handle
  cursor: grab
  display: flex

.coordinate-system-row--dragging
  opacity: 0.5

.coordinate-system-row--drop-target
  outline: 2px solid var(--q-primary)
  outline-offset: -2px
</style>
