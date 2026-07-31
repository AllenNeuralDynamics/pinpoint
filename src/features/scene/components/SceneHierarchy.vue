<script lang="ts" setup>
import { useQuasar } from "quasar";
import {
  buildProbe,
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier,
  Probe,
  ProbeInterfaceProbe,
  ProbeLibraryDialog,
  rotateProbeVisibility
} from "@/features/probe";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  addProbe,
  internProbeInterfaceProbe,
  removeProbe
} from "@/features/experiment";

const $q = useQuasar();
const probeLibrary = useProbeLibraryStore();
const currentExperimentStore = useCurrentExperimentStore();

/**
 * Convert probe visibility state to icon name.
 * @param probe Probe to extract visibility info from.
 */
function probeVisibilityIcon(probe: Probe): string {
  switch (probe.visibility) {
    case "visible":
      return "sym_o_visibility";
    case "shanks":
      return "sym_o_undereye";
    case "hidden":
      return "sym_o_visibility_off";
    default:
      return "sym_o_visibility";
  }
}

/**
 * Build probe, add it to the scene, and select it.
 * @param probeInterfaceProbe Probe interface definition for the probe to create.
 */
function addProbeAndSelect(probeInterfaceProbe: ProbeInterfaceProbe) {
  internProbeInterfaceProbe(
    currentExperimentStore.experiment,
    probeInterfaceProbe
  );
  const probe = buildProbe(probeInterfaceProbe);
  addProbe(currentExperimentStore.experiment, probe);
  currentExperimentStore.selectedInspectable = probe;
}

/**
 * Remove a probe from the scene and ensure it is not selected.
 * @param probe Probe to remove.
 */
function removeProbeAndDeselect(probe: Probe) {
  removeProbe(currentExperimentStore.experiment, probe);
  if (currentExperimentStore.isInspectableSelected(probe)) {
    currentExperimentStore.selectedInspectable = null;
  }
}
</script>

<template>
  <div class="column">
    <q-btn-dropdown
      color="primary"
      dropdown-icon="add"
      :label="$t('sceneHierarchy.addProbe')"
    >
      <q-list>
        <q-item
          v-for="probeInterfaceProbe of probeLibrary.library"
          :key="getProbeInterfaceIdentifier(probeInterfaceProbe)"
          v-close-popup
          v-ripple
          clickable
          @click="addProbeAndSelect(probeInterfaceProbe)"
        >
          <q-item-section>
            {{ getProbeInterfaceDisplayName(probeInterfaceProbe) }}
          </q-item-section>
        </q-item>
        <q-separator />
        <q-item
          v-close-popup
          clickable
          @click="$q.dialog({ component: ProbeLibraryDialog })"
        >
          <q-item-section>
            <q-item-label
              ><b>{{ $t("sceneHierarchy.manageProbes") }}</b></q-item-label
            >
          </q-item-section>
        </q-item>
      </q-list>
    </q-btn-dropdown>
    <q-list separator>
      <q-item
        v-for="probe of currentExperimentStore.probes"
        :key="probe.id"
        v-ripple
        :active="currentExperimentStore.isInspectableSelected(probe)"
        clickable
        @click="currentExperimentStore.selectedInspectable = probe"
      >
        <q-item-section side>
          <q-icon :style="{ color: probe.color }" name="radio_button_checked" />
        </q-item-section>
        <q-item-section>{{ probe.name }}</q-item-section>
        <q-item-section side>
          <div class="row">
            <q-btn
              :icon="probeVisibilityIcon(probe)"
              class="probe--visibility-button"
              flat
              round
              @click.stop="rotateProbeVisibility(probe)"
            />
            <q-btn
              flat
              round
              icon="delete"
              @click.stop="removeProbeAndDeselect(probe)"
            />
          </div>
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<style lang="sass" scoped>
.probe--visibility-button
  font-variation-settings: 'FILL' 1
</style>
