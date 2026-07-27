<script lang="ts" setup>
import { useDialogPluginComponent, useQuasar } from "quasar";
import InstallProbeDialog from "./InstallProbeDialog.vue";
import { useProbeLibraryStore } from "@/stores/probe-library.store";

// Setup dialog.
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();

const $q = useQuasar();
const probeLibraryStore = useProbeLibraryStore();

function installProbe() {
  $q.dialog({ component: InstallProbeDialog }).onOk(probe => {
    probeLibraryStore.add(probe);
  });
}
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card>
      <q-card-section class="column">
        <p class="text-h5">{{ $t("probeLibrary.title") }}</p>

        <q-btn
          icon="add"
          :label="$t('probeLibrary.installProbe')"
          @click="installProbe"
        />

        <q-list class="dialog-list" separator>
          <q-item
            v-for="probe in probeLibraryStore.library"
            :key="`${probe.annotations!.manufacturer}-${probe.annotations!.model_name}`"
          >
            <q-item-section
              >{{ probe.annotations!.manufacturer }}
              {{ probe.annotations!.model_name }}</q-item-section
            >
            <q-item-section side>
              <q-btn
                flat
                icon="delete"
                round
                @click="probeLibraryStore.remove(probe)"
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

<style lang="sass" scoped></style>
