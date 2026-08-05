<script lang="ts" setup>
import { useDialogPluginComponent, useQuasar } from "quasar";
import InstallProbeDialog from "./InstallProbeDialog.vue";
import {
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier
} from "../api/probe.api";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { useDragReorder } from "@/composable/useDragReorder";

defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();

const $q = useQuasar();
const probeLibraryStore = useProbeLibraryStore();

const {
  draggedIndex,
  dropTargetIndex,
  startDrag,
  dragOverRow,
  dropRow,
  endDrag
} = useDragReorder(probeLibraryStore.reorder);

/**
 * Open the install-probe dialog and add its result to the library.
 */
function installProbe() {
  $q.dialog({ component: InstallProbeDialog }).onOk(probe => {
    probeLibraryStore.add(probe);
  });
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
            <q-item-section side>
              <div
                class="probe-row__handle"
                draggable="true"
                :title="$t('probeLibrary.dragToReorder')"
                @dragend="endDrag"
                @dragstart="startDrag(index, $event)"
              >
                <q-icon name="drag_indicator" size="sm" />
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
