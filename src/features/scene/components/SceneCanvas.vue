<script lang="ts" setup>
import {
  computed,
  onMounted,
  onUnmounted,
  onWatcherCleanup,
  ref,
  useTemplateRef,
  watch,
  watchEffect
} from "vue";
import { useBabylonRuntimeService } from "@/composable/useBabylonRuntimeService";
import {
  removeAllStructures,
  setAtlasCenterOffset,
  syncStructuresVisibility
} from "../api/structures.api";
import { setInitialZoom } from "../api/camera.api";
import { StructureEntity } from "../models/structure-entity.model";
import {
  getAtlasCenter,
  getDefaultStructureIdentifiers,
  structureEntitiesFromIdentifiers
} from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useQuasar } from "quasar";
import { useI18n } from "vue-i18n";
import {
  endProbeGizmoDrag,
  selectProbeFromGizmoAttach,
  setProbePositionFromGizmoDrag,
  setProbeRotationFromGizmoDrag,
  syncProbes
} from "../api/probe.api";
import { setReferenceCoordinateNodePosition } from "../api/reference-coordinate.api";
import {
  deselectFromPointerDown,
  selectFromSelectedInspectableState
} from "../api/scene.api";

const $q = useQuasar();
const { t } = useI18n();
const currentExperiment = useCurrentExperimentStore();
const runtime = useBabylonRuntimeService();

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");

/**
 * Whether structures are currently being synced into the scene, driving the
 * loading bar overlaid on the canvas.
 */
const isLoadingStructures = ref(false);

/**
 * Atlas structures that must always be present in the scene, faded out when
 * not visible instead of being removed.
 */
const alwaysPresentStructures = computed<StructureEntity[]>(() => {
  const { manifest, terminologyRows, areAtlasComponentsEvaluating } =
    currentExperiment;
  if (!manifest || !terminologyRows || areAtlasComponentsEvaluating) return [];

  return structureEntitiesFromIdentifiers(
    manifest,
    terminologyRows,
    getDefaultStructureIdentifiers(terminologyRows)
  );
});

/**
 * Structures the current experiment has marked visible.
 */
const visibleStructureEntities = computed<StructureEntity[]>(() => {
  const { manifest, terminologyRows, areAtlasComponentsEvaluating } =
    currentExperiment;
  if (!manifest || !terminologyRows || areAtlasComponentsEvaluating) return [];

  return structureEntitiesFromIdentifiers(
    manifest,
    terminologyRows,
    currentExperiment.visibleStructures
  );
});

/**
 * Trigger engine resizing on page area resize.
 */
function onResize() {
  runtime.engine.value?.resize();
}

// Keep the scene in sync with the current atlas's default structures and the
// experiment's visible structure selection.
watchEffect(async () => {
  const scene = runtime.scene.value;
  if (!scene) return;

  isLoadingStructures.value = true;
  try {
    await syncStructuresVisibility(
      scene,
      alwaysPresentStructures.value,
      visibleStructureEntities.value
    );
  } catch {
    $q.notify({
      message: t("sceneCanvas.problemLoadingAtlasMeshes"),
      caption: t("sceneCanvas.atlasLikelyNotSupportedYet"),
      color: "warning",
      icon: "warning"
    });
  } finally {
    isLoadingStructures.value = false;
  }
});

// Keep the atlas root positioned so the atlas center sits at the scene origin.
watchEffect(() => {
  const scene = runtime.scene.value;
  const { manifest } = currentExperiment;
  if (!scene || !manifest || currentExperiment.isManifestEvaluating) return;

  setAtlasCenterOffset(scene, getAtlasCenter(manifest));
});

// Set the camera's initial zoom relative to the AP length of the atlas.
watchEffect(() => {
  const camera = runtime.camera.value;
  const { manifest, areAtlasComponentsEvaluating } = currentExperiment;
  if (!camera || !manifest || areAtlasComponentsEvaluating) return;

  setInitialZoom(camera, manifest);
});

// Clear the scene whenever the atlas changes, but not when the scene itself
// has just become available for the first time. `currentExperiment.atlas`
// must be read through a getter, not passed as a snapshot value: reading a
// Pinia store getter by property access unwraps it once at call time, so a
// plain value here would never be tracked as a watch source.
watch(
  [runtime.scene, () => currentExperiment.atlas],
  ([newScene], [oldScene]) => {
    if (!newScene || !oldScene) return;

    removeAllStructures(newScene);
  }
);

// Sync the reference coordinate node position.
watchEffect(() => {
  const scene = runtime.scene.value;
  if (!scene) return;
  setReferenceCoordinateNodePosition(scene, currentExperiment.experiment);
});

// Sync probes from state. If the currently selected probe's entity was
// disposed and rebuilt (e.g. from a type change), reattach the gizmo and
// selection outline to the new one -- otherwise they'd be left pointing at
// the disposed node/meshes, desynced from the still-selected probe.
watchEffect(() => {
  const scene = runtime.scene.value;
  const gizmoManager = runtime.gizmoManager.value;
  const selectionOutlineLayer = runtime.selectionOutlineLayer.value;
  if (!scene || !gizmoManager) return;

  const rebuiltProbeIds = syncProbes(
    scene,
    currentExperiment.experiment,
    gizmoManager,
    currentExperiment.draggedProbeId
  );

  const selectedInspectable = currentExperiment.selectedInspectable;
  if (
    selectionOutlineLayer &&
    selectedInspectable &&
    rebuiltProbeIds.includes(selectedInspectable.id)
  ) {
    selectFromSelectedInspectableState(
      selectedInspectable,
      scene,
      gizmoManager,
      selectionOutlineLayer
    );
  }
});

// Sync state from probes. Re-registers whenever the experiment itself is
// replaced (e.g. creating a new experiment), so the drag observers never
// close over a discarded experiment's probes.
watch(
  [runtime.scene, runtime.gizmoManager, () => currentExperiment.experiment],
  ([scene, gizmoManager, experiment]) => {
    if (!scene || !gizmoManager) return;

    const probePositionDraggingObserver = setProbePositionFromGizmoDrag(
      gizmoManager,
      experiment,
      probeId => {
        currentExperiment.draggedProbeId = probeId;
      }
    );
    const probeRotationDraggingObserver = setProbeRotationFromGizmoDrag(
      gizmoManager,
      experiment,
      probeId => {
        currentExperiment.draggedProbeId = probeId;
      }
    );

    const probeDragEndObservers = endProbeGizmoDrag(gizmoManager, () => {
      currentExperiment.draggedProbeId = null;
    });

    onWatcherCleanup(() => {
      probePositionDraggingObserver.remove();
      probeRotationDraggingObserver.remove();
      probeDragEndObservers.forEach(observer => observer.remove());
    });
  }
);

// Register callbacks for selection and deselection. Re-registers whenever
// the experiment itself is replaced, so selection never resolves against a
// discarded experiment's probes.
watch(
  [
    runtime.scene,
    runtime.gizmoManager,
    runtime.selectionOutlineLayer,
    () => currentExperiment.experiment
  ],
  ([scene, gizmoManager, selectionOutlineLayer, experiment]) => {
    if (!scene || !gizmoManager || !selectionOutlineLayer) return;

    const probeSelectionObserver = selectProbeFromGizmoAttach(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      experiment,
      probe => {
        currentExperiment.selectedInspectable = probe;
      }
    );

    const sceneDeselectObserver = deselectFromPointerDown(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      () => {
        currentExperiment.selectedInspectable = null;
      }
    );

    onWatcherCleanup(() => {
      probeSelectionObserver.remove();
      sceneDeselectObserver.remove();
    });
  }
);

// Update selection as it propagates from state.
watchEffect(() => {
  const scene = runtime.scene.value;
  const gizmoManager = runtime.gizmoManager.value;
  const selectionOutlineLayer = runtime.selectionOutlineLayer.value;
  if (!scene || !gizmoManager || !selectionOutlineLayer) return;

  selectFromSelectedInspectableState(
    currentExperiment.selectedInspectable,
    scene,
    gizmoManager,
    selectionOutlineLayer
  );
});

onMounted(async () => {
  if (!canvas.value) {
    throw new Error("Scene canvas not found in DOM!");
  }

  await runtime.init(canvas.value);
});

onUnmounted(() => {
  runtime.dispose();
});
</script>

<template>
  <div class="fit relative-position">
    <canvas ref="canvas" class="fit" />
    <q-linear-progress
      v-if="isLoadingStructures"
      indeterminate
      color="secondary"
      size="lg"
      class="absolute-top"
    />
  </div>
  <q-resize-observer @resize="onResize" />
</template>

<style scoped>
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
