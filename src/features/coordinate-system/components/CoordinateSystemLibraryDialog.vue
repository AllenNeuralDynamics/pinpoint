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
 * Accept a drag over a row, except over the pinned default at index 0.
 * @param index Index of the row being hovered.
 * @param event Drag event to accept.
 */
function onDragOverRow(index: number, event: DragEvent): void {
  if (index === 0) return;
  dragOverRow(index, event);
}

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
 * Open a row in the inspector, except the pinned default at index 0, which is
 * locked to its definition.
 * @param index Index of the clicked row.
 * @param coordinateSystem Coordinate system the row renders.
 */
function onRowClick(index: number, coordinateSystem: CoordinateSystem): void {
  if (index === 0) return;
  openInInspector(coordinateSystem);
}

/**
 * Ask the user to confirm, then remove the coordinate system from the library.
 * @param coordinateSystem Coordinate system to remove.
 */
function confirmRemove(coordinateSystem: CoordinateSystem) {
  $q.notify({
    message: t("coordinateSystemLibrary.confirmDelete", {
      name: coordinateSystem.name
    }),
    color: "warning",
    icon: "warning",
    timeout: 0,
    actions: [
      { label: t("coordinateSystemLibrary.cancel"), color: "white" },
      {
        label: t("coordinateSystemLibrary.delete"),
        color: "white",
        handler: () => {
          if (currentExperimentStore.isInspectableSelected(coordinateSystem)) {
            currentExperimentStore.selectedInspectable = null;
          }
          coordinateSystemLibraryStore.remove(coordinateSystem);
        }
      }
    ]
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
            :clickable="index > 0"
            v-ripple="index > 0"
            :class="{
              'coordinate-system-row--dragging': draggedIndex === index,
              'coordinate-system-row--drop-target':
                dropTargetIndex === index && draggedIndex !== index
            }"
            @click="onRowClick(index, coordinateSystem)"
            @dragover="onDragOverRow(index, $event)"
            @drop="dropRow(index)"
          >
            <q-item-section side>
              <!-- Index 0 is the built-in default: pinned first, so it gets a lock in place of
                   the drag handle rather than an empty section, which would collapse
                   (`.q-item__section--side` is `min-width: 0`) and misalign this row's name. -->
              <div
                v-if="index > 0"
                class="coordinate-system-row__handle"
                draggable="true"
                :title="t('coordinateSystemLibrary.dragToReorder')"
                @dragend="endDrag"
                @dragstart.stop="startDrag(index, $event)"
              >
                <q-icon name="drag_indicator" size="sm" />
              </div>
              <q-icon
                v-else
                name="lock"
                size="sm"
                :title="t('coordinateSystemLibrary.defaultPinned')"
              />
            </q-item-section>
            <q-item-section>{{ coordinateSystem.name }}</q-item-section>
            <q-item-section v-if="index > 0" side>
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
