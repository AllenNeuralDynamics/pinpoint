<script lang="ts" setup>
import { useQuasar } from "quasar";
import {
  buildProbe,
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier,
  type Probe,
  type ProbeInterfaceProbe,
  ProbeLibraryDialog,
  type ProbeVisibility,
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
const currentExperiment = useCurrentExperimentStore();

/** Icon for each probe visibility state. */
const PROBE_VISIBILITY_ICONS: Record<ProbeVisibility, string> = {
  visible: "sym_o_visibility",
  shanks: "sym_o_undereye",
  hidden: "sym_o_visibility_off"
};

/**
 * Build probe, add it to the scene, and select it.
 * @param probeInterfaceProbe Probe interface definition for the probe to create.
 */
function addProbeAndSelect(probeInterfaceProbe: ProbeInterfaceProbe) {
  internProbeInterfaceProbe(currentExperiment.experiment, probeInterfaceProbe);
  const probe = buildProbe(probeInterfaceProbe);
  addProbe(currentExperiment.experiment, probe);
  currentExperiment.selectedInspectable = probe;
}

/**
 * Remove a probe from the scene and ensure it is not selected.
 * @param probe Probe to remove.
 */
function removeProbeAndDeselect(probe: Probe) {
  removeProbe(currentExperiment.experiment, probe);
  if (currentExperiment.isInspectableSelected(probe)) {
    currentExperiment.selectedInspectable = null;
  }
}
</script>

<template>
  <div class="column q-gutter-y-sm">
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
        v-for="probe of currentExperiment.probes"
        :key="probe.id"
        v-ripple
        :active="currentExperiment.isInspectableSelected(probe)"
        active-class="probe-item--active"
        :aria-current="
          currentExperiment.isInspectableSelected(probe) ? 'true' : undefined
        "
        clickable
        @click="currentExperiment.selectedInspectable = probe"
      >
        <q-item-section side>
          <q-icon :style="{ color: probe.color }" name="radio_button_checked" />
        </q-item-section>
        <q-item-section>{{ probe.name }}</q-item-section>
        <q-item-section side>
          <div class="row">
            <q-btn
              :icon="PROBE_VISIBILITY_ICONS[probe.visibility]"
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

.probe-item--active
  background: rgba($primary, 0.12)
  font-weight: 500
  box-shadow: inset 3px 0 0 $primary

body.body--dark
  .probe-item--active
    background: rgba($primary, 0.28)
</style>
