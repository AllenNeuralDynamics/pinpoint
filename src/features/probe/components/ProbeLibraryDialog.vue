<script lang="ts" setup>
import { computed } from "vue";
import { useDialogPluginComponent, useQuasar } from "quasar";
import InstallProbeDialog from "./InstallProbeDialog.vue";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { ProbeInterfaceProbe } from "../models/probe-interface.model";
import { KNOWN_PROBES } from "../models/known-probes.model";

// A library entry, pairing its probe with a human-readable label (falling
// back to "<manufacturer> <model name>" when not in KNOWN_PROBES).
interface ProbeOption {
  probe: ProbeInterfaceProbe;
  label: string;
}

// Setup dialog.
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();

const $q = useQuasar();
const probeLibraryStore = useProbeLibraryStore();

const probeOptions = computed<ProbeOption[]>(() =>
  probeLibraryStore.library.map(probe => {
    const { manufacturer, model_name: modelName } = probe.annotations!;

    return {
      probe,
      label:
        KNOWN_PROBES[`${manufacturer} ${modelName}`]?.trim() ??
        `${manufacturer} ${modelName}`
    };
  })
);

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
            v-for="probeOption in probeOptions"
            :key="`${probeOption.probe.annotations!.manufacturer}-${probeOption.probe.annotations!.model_name}`"
          >
            <q-item-section>{{ probeOption.label }}</q-item-section>
            <q-item-section side>
              <q-btn
                flat
                icon="delete"
                round
                @click="probeLibraryStore.remove(probeOption.probe)"
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
