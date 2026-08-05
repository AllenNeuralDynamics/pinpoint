<script lang="ts" setup>
import {
  computed,
  onMounted,
  onUnmounted,
  onWatcherCleanup,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
  watchEffect
} from "vue";
import { useBabylonRuntimeService } from "../composable/useBabylonRuntimeService";
import {
  removeAllStructures,
  setAtlasCenterOffset,
  syncStructuresVisibility
} from "../api/structures.api";
import type { AxisGuides } from "../api/axis-guide.api";
import {
  buildAxisGuides,
  clearAxisGuides,
  createAxisGuides
} from "../api/axis-guide.api";
import { setInitialZoom } from "../api/camera.api";
import type { StructureEntity } from "@/features/atlas";
import {
  getAtlasCenter,
  getAtlasDimensionsMillimeters,
  getDefaultStructureIdentifiers,
  structureEntitiesFromIdentifiers
} from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useI18n } from "vue-i18n";
import {
  endProbeGizmoDrag,
  selectProbeFromGizmoAttach,
  setProbePositionFromGizmoDrag,
  setProbeRotationFromGizmoDrag,
  syncProbes
} from "../api/probe.api";
import { setGizmoControls } from "../api/gizmo.api";
import type { GizmoCoordinateSpace, GizmoMode } from "../models/gizmo.model";
import { setReferenceCoordinateNodePosition } from "../api/reference-coordinate.api";
import {
  deselectFromPointerDown,
  orbitCameraFromAxisGuideDoubleTap,
  selectFromSelectedInspectableState
} from "../api/scene.api";
import { useNotify } from "@/composable/useNotify";

const { t } = useI18n();
const { notifyWarning } = useNotify();
const currentExperiment = useCurrentExperimentStore();
const runtime = useBabylonRuntimeService();

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");

/** Whether structures are currently being synced into the scene, driving the loading bar. */
const isLoadingStructures = ref(false);

/** Axis guide text renderers, created for the current scene the first time the guides are shown. */
const axisGuides = shallowRef<AxisGuides | null>(null);

const areAxisGuidesVisible = ref(false);

const gizmoMode = ref<GizmoMode>("position");
const gizmoCoordinateSpace = ref<GizmoCoordinateSpace>("local");

/**
 * Terminology rows for the current atlas, empty while they resolve.
 */
const terminologyRows = computed(() =>
  currentExperiment.isTerminologyRowsEvaluating
    ? []
    : currentExperiment.terminologyRows
);

/**
 * Atlas structures that must always be present in the scene, faded out when
 * not visible instead of being removed.
 */
const alwaysPresentStructures = computed<StructureEntity[]>(() =>
  structureEntitiesFromIdentifiers(
    currentExperiment.atlas,
    terminologyRows.value,
    getDefaultStructureIdentifiers(
      currentExperiment.atlas.name,
      terminologyRows.value
    )
  )
);

/**
 * Structures the current experiment has marked visible.
 */
const visibleStructureEntities = computed<StructureEntity[]>(() =>
  structureEntitiesFromIdentifiers(
    currentExperiment.atlas,
    terminologyRows.value,
    currentExperiment.visibleStructures
  )
);

/**
 * Trigger engine resizing on page area resize.
 */
function onResize() {
  runtime.engine.value?.resize();
}

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
    notifyWarning(
      t("sceneCanvas.problemLoadingAtlasMeshes"),
      t("sceneCanvas.atlasLikelyNotSupportedYet")
    );
  } finally {
    isLoadingStructures.value = false;
  }
});

watchEffect(() => {
  const scene = runtime.scene.value;
  if (!scene) return;

  setAtlasCenterOffset(scene, getAtlasCenter(currentExperiment.atlas));
});

// Axis guide renderers belong to the scene that created them.
watch(runtime.scene, () => {
  axisGuides.value?.dispose();
  axisGuides.value = null;
});

// Create the axis guide text renderers the first time they are shown: the
// MSDF font is fetched remotely, so hidden guides load nothing.
watch(
  [runtime.scene, areAxisGuidesVisible],
  async ([scene, isVisible]) => {
    if (!scene || !isVisible || axisGuides.value) return;

    try {
      const guides = await createAxisGuides(scene);
      // The scene can be replaced, or another creation can win, while the
      // font loads.
      if (runtime.scene.value !== scene || axisGuides.value) {
        guides.dispose();
        return;
      }
      axisGuides.value = guides;
    } catch {
      notifyWarning(
        t("sceneCanvas.problemLoadingAxisGuides"),
        t("sceneCanvas.axisGuidesUnavailable")
      );
    }
  },
  { immediate: true }
);

// Draw the atlas's axis guide labels while they are shown, and strip them
// when hidden, keeping the loaded renderers for the next time.
watchEffect(() => {
  const scene = runtime.scene.value;
  const guides = axisGuides.value;
  if (!scene || !guides) return;

  if (!areAxisGuidesVisible.value) {
    clearAxisGuides(scene, guides);
    return;
  }

  buildAxisGuides(scene, guides, currentExperiment.atlas);
});

watchEffect(() => {
  const camera = runtime.camera.value;
  if (!camera) return;

  setInitialZoom(
    camera,
    getAtlasDimensionsMillimeters(currentExperiment.atlas)[0]
  );
});

watch([runtime.scene, runtime.camera], ([scene, camera]) => {
  if (!scene || !camera) return;

  const observer = orbitCameraFromAxisGuideDoubleTap(scene, camera);
  onWatcherCleanup(() => observer.remove());
});

// Clear the scene whenever the atlas changes, but not on the scene's own
// first availability.
watch(
  [runtime.scene, () => currentExperiment.atlas],
  ([newScene], [oldScene]) => {
    if (!newScene || !oldScene) return;

    removeAllStructures(newScene);
  }
);

watchEffect(() => {
  const scene = runtime.scene.value;
  if (!scene) return;
  setReferenceCoordinateNodePosition(
    scene,
    currentExperiment.referenceCoordinate
  );
});

// Sync probes from state, reattaching selection to any rebuilt entity.
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
      scene,
      gizmoManager,
      selectionOutlineLayer,
      selectedInspectable
    );
  }
});

// Configure the gizmos from the control bar and keep the probe drag
// observers on them.
watch(
  [
    runtime.gizmoManager,
    () => currentExperiment.probes,
    gizmoMode,
    gizmoCoordinateSpace
  ],
  ([gizmoManager, probes, mode, coordinateSpace]) => {
    if (!gizmoManager) return;

    const gizmos = setGizmoControls(gizmoManager, mode, coordinateSpace);
    if (!gizmos) return;

    const probePositionDraggingObserver = setProbePositionFromGizmoDrag(
      gizmos.positionGizmo,
      probes,
      probeId => {
        currentExperiment.draggedProbeId = probeId;
      }
    );
    const probeRotationDraggingObserver = setProbeRotationFromGizmoDrag(
      gizmos.rotationGizmo,
      probes,
      probeId => {
        currentExperiment.draggedProbeId = probeId;
      }
    );
    const probeDragEndObservers = endProbeGizmoDrag(gizmos, () => {
      currentExperiment.draggedProbeId = null;
    });

    onWatcherCleanup(() => {
      probePositionDraggingObserver.remove();
      probeRotationDraggingObserver.remove();
      probeDragEndObservers.forEach(observer => observer.remove());
    });
  }
);

// Register selection and deselection callbacks, re-registering when the
// experiment is replaced.
watch(
  [
    runtime.scene,
    runtime.gizmoManager,
    runtime.selectionOutlineLayer,
    () => currentExperiment.probes
  ],
  ([scene, gizmoManager, selectionOutlineLayer, probes]) => {
    if (!scene || !gizmoManager || !selectionOutlineLayer) return;

    const probeSelectionObserver = selectProbeFromGizmoAttach(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      probes,
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

watchEffect(() => {
  const scene = runtime.scene.value;
  const gizmoManager = runtime.gizmoManager.value;
  const selectionOutlineLayer = runtime.selectionOutlineLayer.value;
  if (!scene || !gizmoManager || !selectionOutlineLayer) return;

  selectFromSelectedInspectableState(
    scene,
    gizmoManager,
    selectionOutlineLayer,
    currentExperiment.selectedInspectable
  );
});

onMounted(async () => {
  if (!canvas.value) {
    throw new Error("Scene canvas not found in DOM!");
  }

  await runtime.init(canvas.value);
});

onUnmounted(() => {
  axisGuides.value?.dispose();
  axisGuides.value = null;
  runtime.dispose();
});
</script>

<template>
  <div class="fit relative-position">
    <canvas ref="canvas" class="fit" />
    <q-linear-progress
      v-if="isLoadingStructures"
      indeterminate
      color="primary"
      size="lg"
      class="absolute-top"
    />
  </div>
  <q-resize-observer @resize="onResize" />
  <q-page-sticky :offset="[0, 18]" position="bottom">
    <q-card>
      <q-card-section class="row justify-center gizmo-controls">
        <q-toggle
          v-model="areAxisGuidesVisible"
          :label="$t('sceneCanvas.showAxisGuides')"
          left-label
        />
        <q-btn-toggle
          v-model="gizmoMode"
          :aria-label="$t('sceneCanvas.gizmoMode')"
          :options="[
            {
              label: $t('sceneCanvas.gizmoPosition'),
              value: 'position',
              icon: 'sym_o_point_scan'
            },
            {
              label: $t('sceneCanvas.gizmoRotation'),
              value: 'rotation',
              icon: 'flip_camera_android'
            }
          ]"
          toggle-color="primary"
        />
        <q-btn-toggle
          v-model="gizmoCoordinateSpace"
          :aria-label="$t('sceneCanvas.gizmoCoordinateSpace')"
          :options="[
            {
              label: $t('sceneCanvas.gizmoLocal'),
              value: 'local',
              icon: 'sym_o_nearby'
            },
            {
              label: $t('sceneCanvas.gizmoGlobal'),
              value: 'global',
              icon: 'sym_o_globe'
            }
          ]"
          toggle-color="primary"
        />
      </q-card-section>
    </q-card>
  </q-page-sticky>
</template>

<style lang="sass" scoped>
canvas
  display: block
  width: 100%
  height: 100%

.gizmo-controls
  gap: 16px
</style>
