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
import { useDragReorder } from "@/composable/useDragReorder";
import {
  addProbe,
  internProbeInterfaceProbe,
  removeProbe,
  reorderProbe
} from "@/features/experiment";
import { CAMERA_INSPECTABLE } from "../models/camera-inspectable.model";

const $q = useQuasar();
const probeLibrary = useProbeLibraryStore();
const currentExperiment = useCurrentExperimentStore();

const {
  draggedIndex,
  dropTargetIndex,
  startDrag,
  dragOverRow,
  dropRow,
  endDrag
} = useDragReorder((fromIndex, toIndex) =>
  reorderProbe(currentExperiment.experiment, fromIndex, toIndex)
);

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
  <q-list>
    <q-expansion-item
      default-opened
      header-class="text-weight-bold"
      icon="sym_o_acupuncture"
      :label="$t('sceneHierarchy.probes')"
    >
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
        <q-list class="probe-list" separator>
          <q-item
            v-for="(probe, index) of currentExperiment.probes"
            :key="probe.id"
            v-ripple
            :active="currentExperiment.isInspectableSelected(probe)"
            active-class="hierarchy-item--active"
            :aria-current="
              currentExperiment.isInspectableSelected(probe)
                ? 'true'
                : undefined
            "
            :class="{
              'probe-row--dragging': draggedIndex === index,
              'probe-row--drop-target':
                dropTargetIndex === index && draggedIndex !== index
            }"
            clickable
            @click="currentExperiment.selectedInspectable = probe"
            @dragover="dragOverRow(index, $event)"
            @drop="dropRow(index)"
          >
            <q-item-section side>
              <div
                class="probe-row__handle"
                draggable="true"
                :title="$t('sceneHierarchy.dragToReorder')"
                @dragend="endDrag"
                @dragstart.stop="startDrag(index, $event)"
              >
                <q-icon
                  :style="{ color: probe.color }"
                  name="radio_button_checked"
                  size="sm"
                />
              </div>
            </q-item-section>
            <q-item-section>{{ probe.name }}</q-item-section>
            <q-item-section side>
              <div class="row">
                <q-btn
                  :icon="PROBE_VISIBILITY_ICONS[probe.visibility]"
                  class="visibility-button"
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
    </q-expansion-item>
    <q-separator />
    <q-expansion-item
      default-opened
      header-class="text-weight-bold"
      icon="sym_o_deployed_code"
      :label="$t('sceneHierarchy.scene')"
    >
      <q-list class="scene-list" separator>
        <q-item
          v-ripple
          :active="currentExperiment.isInspectableSelected(CAMERA_INSPECTABLE)"
          active-class="hierarchy-item--active"
          :aria-current="
            currentExperiment.isInspectableSelected(CAMERA_INSPECTABLE)
              ? 'true'
              : undefined
          "
          clickable
          @click="currentExperiment.selectedInspectable = CAMERA_INSPECTABLE"
        >
          <q-item-section side><q-icon name="sym_o_videocam" /></q-item-section>
          <q-item-section>{{ $t("sceneHierarchy.camera") }}</q-item-section>
        </q-item>
        <q-item
          v-ripple
          clickable
          @click="currentExperiment.selectedInspectable = null"
        >
          <q-item-section side
            ><q-icon name="sym_o_straighten"
          /></q-item-section>
          <q-item-section>{{ $t("sceneHierarchy.axisGuides") }}</q-item-section>
          <q-item-section side>
            <q-btn
              :aria-label="
                currentExperiment.areAxisGuidesVisible
                  ? $t('sceneHierarchy.hideAxisGuides')
                  : $t('sceneHierarchy.showAxisGuides')
              "
              class="visibility-button"
              :icon="
                currentExperiment.areAxisGuidesVisible
                  ? 'sym_o_visibility'
                  : 'sym_o_visibility_off'
              "
              flat
              round
              @click.stop="
                currentExperiment.areAxisGuidesVisible =
                  !currentExperiment.areAxisGuidesVisible
              "
            />
          </q-item-section>
        </q-item>
      </q-list>
    </q-expansion-item>
  </q-list>
</template>

<style lang="sass" scoped>
.visibility-button
  font-variation-settings: 'FILL' 1

.probe-row__handle
  cursor: grab
  display: flex

.probe-row--dragging
  opacity: 0.5

.probe-row--drop-target
  outline: 2px solid var(--q-primary)
  outline-offset: -2px

.hierarchy-item--active
  background: rgba($primary, 0.12)
  font-weight: 500
  box-shadow: inset 3px 0 0 $primary

body.body--dark
  .hierarchy-item--active
    background: rgba($primary, 0.28)
</style>
