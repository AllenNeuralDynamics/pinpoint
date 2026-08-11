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
import { useCoordinateSystemLibraryStore } from "@/stores/coordinate-system-library.store";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useDragReorder } from "@/composable/useDragReorder";
import {
  addProbe,
  addSceneObject,
  internProbeInterfaceProbe,
  removeProbe,
  removeSceneObject,
  reorderProbe,
  reorderSceneObject,
  setProbeCoordinateSystem
} from "@/features/experiment";
import {
  buildSceneObject,
  toggleSceneObjectVisibility
} from "../api/scene-object.api";
import { useModelFileImport } from "../composable/useModelFileImport";
import type { SceneObject } from "../models/scene-object.model";
import type { SceneObjectVisibility } from "../models/scene-object-visibility.model";

const $q = useQuasar();
const probeLibrary = useProbeLibraryStore();
const coordinateSystemLibrary = useCoordinateSystemLibraryStore();
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

const {
  draggedIndex: draggedSceneObjectIndex,
  dropTargetIndex: sceneObjectDropTargetIndex,
  startDrag: startSceneObjectDrag,
  dragOverRow: dragOverSceneObjectRow,
  dropRow: dropSceneObjectRow,
  endDrag: endSceneObjectDrag
} = useDragReorder((fromIndex, toIndex) =>
  reorderSceneObject(currentExperiment.experiment, fromIndex, toIndex)
);

const { isImporting: isImportingModel, open: openModelFile } =
  useModelFileImport((modelId, file) => {
    const sceneObject = buildSceneObject(modelId, file.name);
    addSceneObject(currentExperiment.experiment, sceneObject);
    currentExperiment.selectedInspectable = sceneObject;
  });

/** Icon for each probe visibility state. */
const PROBE_VISIBILITY_ICONS: Record<ProbeVisibility, string> = {
  visible: "sym_o_visibility",
  shanks: "sym_o_undereye",
  hidden: "sym_o_visibility_off"
};

/** Icon for each scene object visibility state. */
const SCENE_OBJECT_VISIBILITY_ICONS: Record<SceneObjectVisibility, string> = {
  visible: "sym_o_visibility",
  hidden: "sym_o_visibility_off"
};

/**
 * Build probe, add it to the scene, and select it.
 * @param probeInterfaceProbe Probe interface definition for the probe to create.
 */
function addProbeAndSelect(probeInterfaceProbe: ProbeInterfaceProbe) {
  internProbeInterfaceProbe(currentExperiment.experiment, probeInterfaceProbe);
  const coordinateSystem = coordinateSystemLibrary.library[0]!;
  const probe = buildProbe(
    probeInterfaceProbe,
    currentExperiment.referenceCoordinate,
    coordinateSystem
  );
  addProbe(currentExperiment.experiment, probe);
  setProbeCoordinateSystem(
    currentExperiment.experiment,
    probe,
    coordinateSystem
  );
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

/**
 * Remove a scene object from the scene and ensure it is not selected.
 * @param sceneObject Scene object to remove.
 */
function removeSceneObjectAndDeselect(sceneObject: SceneObject) {
  removeSceneObject(currentExperiment.experiment, sceneObject);
  if (currentExperiment.isInspectableSelected(sceneObject)) {
    currentExperiment.selectedInspectable = null;
  }
}
</script>

<template>
  <q-list class="hierarchy-list">
    <q-expansion-item
      class="probes-item"
      default-opened
      header-class="text-weight-bold"
      icon="sym_o_acupuncture"
      :label="$t('sceneHierarchy.probes')"
    >
      <div class="probes-panel column q-gutter-y-sm">
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
              'hierarchy-row--dragging': draggedIndex === index,
              'hierarchy-row--drop-target':
                dropTargetIndex === index && draggedIndex !== index
            }"
            clickable
            @click="currentExperiment.selectedInspectable = probe"
            @dragover="dragOverRow(index, $event)"
            @drop="dropRow(index)"
          >
            <q-item-section side>
              <div
                class="hierarchy-row__handle"
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
      <div class="column q-gutter-y-sm">
        <q-btn
          color="primary"
          icon="add"
          :label="$t('sceneHierarchy.addSceneObject')"
          :loading="isImportingModel"
          @click="openModelFile"
        />
        <q-list class="scene-list" separator>
          <q-item
            v-ripple
            :active="
              currentExperiment.isInspectableSelected(
                currentExperiment.cameraPose
              )
            "
            active-class="hierarchy-item--active"
            :aria-current="
              currentExperiment.isInspectableSelected(
                currentExperiment.cameraPose
              )
                ? 'true'
                : undefined
            "
            clickable
            @click="
              currentExperiment.selectedInspectable =
                currentExperiment.cameraPose
            "
          >
            <q-item-section side
              ><q-icon name="sym_o_videocam"
            /></q-item-section>
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
            <q-item-section>{{
              $t("sceneHierarchy.axisGuides")
            }}</q-item-section>
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
        <q-list class="scene-object-list" separator>
          <q-item
            v-for="(sceneObject, index) of currentExperiment.sceneObjects"
            :key="sceneObject.id"
            v-ripple
            :active="currentExperiment.isInspectableSelected(sceneObject)"
            active-class="hierarchy-item--active"
            :aria-current="
              currentExperiment.isInspectableSelected(sceneObject)
                ? 'true'
                : undefined
            "
            :class="{
              'hierarchy-row--dragging': draggedSceneObjectIndex === index,
              'hierarchy-row--drop-target':
                sceneObjectDropTargetIndex === index &&
                draggedSceneObjectIndex !== index
            }"
            clickable
            @click="currentExperiment.selectedInspectable = sceneObject"
            @dragover="dragOverSceneObjectRow(index, $event)"
            @drop="dropSceneObjectRow(index)"
          >
            <q-item-section side>
              <div
                class="hierarchy-row__handle"
                draggable="true"
                :title="$t('sceneHierarchy.dragToReorder')"
                @dragend="endSceneObjectDrag"
                @dragstart.stop="startSceneObjectDrag(index, $event)"
              >
                <q-icon name="drag_indicator" size="sm" />
              </div>
            </q-item-section>
            <q-item-section>{{ sceneObject.name }}</q-item-section>
            <q-item-section side>
              <div class="row">
                <q-btn
                  :aria-label="
                    sceneObject.visibility === 'visible'
                      ? $t('sceneHierarchy.hideSceneObject')
                      : $t('sceneHierarchy.showSceneObject')
                  "
                  class="visibility-button"
                  :icon="SCENE_OBJECT_VISIBILITY_ICONS[sceneObject.visibility]"
                  flat
                  round
                  @click.stop="toggleSceneObjectVisibility(sceneObject)"
                />
                <q-btn
                  :aria-label="$t('sceneHierarchy.removeSceneObject')"
                  flat
                  round
                  icon="delete"
                  @click.stop="removeSceneObjectAndDeselect(sceneObject)"
                />
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </div>
    </q-expansion-item>
  </q-list>
</template>

<style lang="sass" scoped>
.hierarchy-list
  display: flex
  flex-direction: column
  flex-wrap: nowrap
  height: 100%

.probes-item
  display: flex
  flex: 1 1 0%
  flex-direction: column
  min-height: 0

  :deep(.q-expansion-item__container)
    display: flex
    flex: 1 1 auto
    flex-direction: column
    min-height: 0

  :deep(.q-expansion-item__content)
    display: flex
    flex: 1 1 auto
    flex-direction: column
    min-height: 0

.probes-panel
  flex: 1 1 auto
  min-height: 0

.probe-list
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto

.visibility-button
  font-variation-settings: 'FILL' 1

.hierarchy-row__handle
  cursor: grab
  display: flex

.hierarchy-row--dragging
  opacity: 0.5

.hierarchy-row--drop-target
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
