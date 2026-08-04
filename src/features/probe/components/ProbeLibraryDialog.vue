<script lang="ts" setup>
import { ref } from "vue";
import { useDialogPluginComponent, useQuasar } from "quasar";
import InstallProbeDialog from "./InstallProbeDialog.vue";
import {
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier
} from "../api/probe.api";
import { useProbeLibraryStore } from "@/stores/probe-library.store";

defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();

const $q = useQuasar();
const probeLibraryStore = useProbeLibraryStore();

const draggedIndex = ref<number | null>(null);
const dropTargetIndex = ref<number | null>(null);

/**
 * Open the install-probe dialog and add its result to the library.
 */
function installProbe() {
  $q.dialog({ component: InstallProbeDialog }).onOk(probe => {
    probeLibraryStore.add(probe);
  });
}

/**
 * Begin dragging the library row at the given index.
 * @param index Index of the dragged row.
 * @param event Drag event to mark as a move.
 */
function startDrag(index: number, event: DragEvent) {
  draggedIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.effectAllowed = "move";
  }
}

/**
 * Mark the row at the given index as the drop target and allow the drop.
 * @param index Index of the row being hovered.
 * @param event Drag event to accept.
 */
function dragOverRow(index: number, event: DragEvent) {
  if (draggedIndex.value === null) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  dropTargetIndex.value = index;
}

/**
 * Move the dragged probe to the dropped-on index.
 * @param index Index the drag was dropped on.
 */
function dropRow(index: number) {
  if (draggedIndex.value !== null) {
    probeLibraryStore.reorder(draggedIndex.value, index);
  }
  endDrag();
}

/**
 * Clear drag state after a drop or a cancelled drag.
 */
function endDrag() {
  draggedIndex.value = null;
  dropTargetIndex.value = null;
}
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="probe-library">
      <q-card-section>
        <div class="text-h5">{{ $t("probeLibrary.title") }}</div>
      </q-card-section>
      <q-card-section class="column probe-library__content">
        <q-btn
          icon="add"
          :label="$t('probeLibrary.installProbe')"
          @click="installProbe"
        />

        <q-list class="dialog-list" separator>
          <q-item
            v-for="(probeInterfaceProbe, index) in probeLibraryStore.library"
            :key="getProbeInterfaceIdentifier(probeInterfaceProbe)"
            :class="{
              'probe-row--dragging': draggedIndex === index,
              'probe-row--drop-target':
                dropTargetIndex === index && draggedIndex !== index
            }"
            @dragover="dragOverRow(index, $event)"
            @drop="dropRow(index)"
          >
            <q-item-section avatar>
              <div
                class="probe-row__handle"
                draggable="true"
                :title="$t('probeLibrary.dragToReorder')"
                @dragend="endDrag"
                @dragstart="startDrag(index, $event)"
              >
                <q-icon name="drag_indicator" />
              </div>
            </q-item-section>
            <q-item-section>{{
              getProbeInterfaceDisplayName(probeInterfaceProbe)
            }}</q-item-section>
            <q-item-section side>
              <q-btn
                flat
                icon="delete"
                round
                @click="probeLibraryStore.remove(probeInterfaceProbe)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          color="primary"
          :label="$t('probeLibrary.close')"
          @click="onDialogOK"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.probe-library
  display: flex
  flex-direction: column
  overflow: hidden

.probe-library__content
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto

.probe-row__handle
  cursor: grab
  display: flex

.probe-row--dragging
  opacity: 0.5

.probe-row--drop-target
  outline: 2px solid var(--q-primary)
  outline-offset: -2px
</style>
