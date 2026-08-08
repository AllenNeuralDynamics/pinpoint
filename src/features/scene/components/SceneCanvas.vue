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
import { useCameraPoseSync } from "../composable/useCameraPoseSync";
import {
  setAtlasCenterOffset,
  setStructureInteriorsHidden,
  syncStructuresVisibility
} from "../api/structures.api";
import type { AxisGuides } from "../api/axis-guide.api";
import {
  buildAxisGuides,
  clearAxisGuides,
  createAxisGuides
} from "../api/axis-guide.api";
import {
  applyCameraProjection,
  trackAxisViewProjection
} from "../api/camera.api";
import type { SurfaceMaterialSettings } from "../api/material.api";
import {
  applySurfaceMaterialSettingsToNewMaterials,
  syncSceneMaterials
} from "../api/material.api";
import type { ProbeGeometry } from "../models/probe-geometry.model";
import type { StructureEntity } from "@/features/atlas";
import {
  getAtlasCenter,
  getAtlasDimensionsMillimeters,
  getAtlasLongestDimensionMillimeters,
  structureEntitiesFromIdentifiers
} from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useI18n } from "vue-i18n";
import type { Mesh, Scene, SSAO2RenderingPipeline } from "@babylonjs/core";
import {
  endProbeGizmoDrag,
  getProbeMeshes,
  selectProbeFromGizmoAttach,
  setProbePositionFromGizmoDrag,
  setProbeRotationFromGizmoDrag,
  syncProbes
} from "../api/probe.api";
import {
  createCollisionState,
  pruneCollisions,
  syncCollisionHighlight,
  trackCollisions
} from "../api/collision.api";
import {
  createSceneObjectSyncState,
  endSceneObjectGizmoDrag,
  getSceneObjectMeshes,
  selectSceneObjectFromGizmoAttach,
  setSceneObjectPositionFromGizmoDrag,
  setSceneObjectRotationFromGizmoDrag,
  setSceneObjectScaleFromGizmoDrag,
  syncSceneObjects
} from "../api/scene-object-node.api";
import {
  createProbeBodyModelSyncState,
  endProbeBodyModelGizmoDrag,
  getProbeGizmoNode,
  setProbeBodyModelPositionFromGizmoDrag,
  setProbeBodyModelRotationFromGizmoDrag,
  setProbeBodyModelScaleFromGizmoDrag,
  syncProbeBodyModels
} from "../api/probe-body-model.api";
import { getSceneModel } from "../api/scene-model.api";
import { setGizmoControls } from "../api/gizmo.api";
import type { GizmoCoordinateSpace, GizmoMode } from "../models/gizmo.model";
import { setReferenceCoordinateNodePosition } from "../api/reference-coordinate.api";
import {
  buildProbeSurfacePaths,
  disposeProbeSurfacePaths,
  pickProbeSurfacePathOnTap
} from "../api/probe-surface-path.api";
import {
  isProbeSurfaceChoiceCurrent,
  setProbeTipMillimeters
} from "@/features/probe";
import {
  deselectFromPointerDown,
  orbitCameraFromAxisGuideDoubleTap,
  selectFromSelectedInspectableState,
  setHemisphericLightIntensity,
  setSceneBackgroundColor
} from "../api/scene.api";
import {
  attachSsaoPipeline,
  detachSsaoPipeline,
  isSsaoSupported,
  scaleSsaoToAtlas
} from "../api/ssao.api";
import { useNotify } from "@/composable/useNotify";

const { t } = useI18n();
const { notifyError, notifyWarning } = useNotify();
const currentExperiment = useCurrentExperimentStore();
const preferences = usePreferencesStore();
const runtime = useBabylonRuntimeService();
useCameraPoseSync(
  runtime.camera,
  () => currentExperiment.atlas,
  () => currentExperiment.referenceCoordinate,
  () => currentExperiment.experiment.cameraPose,
  () => {
    currentExperiment.isCameraMoving = true;
  },
  () => currentExperiment.endCameraMove()
);

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");

/** Whether structures are currently being synced into the scene, driving the loading bar. */
const isLoadingStructures = ref(false);

/** Axis guide text renderers, created for the current scene the first time the guides are shown. */
const axisGuides = shallowRef<AxisGuides | null>(null);

/** SSAO pipeline for the current scene, present while ambient occlusion is on and supported. */
const ssaoPipeline = shallowRef<SSAO2RenderingPipeline | null>(null);

/** Overlap bookkeeping for scene entity trigger events, read and mutated in place. */
const collisionState = createCollisionState();

/** Load bookkeeping for scene object GLBs, read and mutated in place. */
const sceneObjectSyncState = createSceneObjectSyncState();

/** Load bookkeeping for probe body models, read and mutated in place. */
const probeBodyModelSyncState = createProbeBodyModelSyncState();

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
 * Structures kept in the scene but faded out.
 */
const fadedStructures = computed<StructureEntity[]>(() =>
  structureEntitiesFromIdentifiers(
    currentExperiment.atlas,
    terminologyRows.value,
    currentExperiment.visibleStructures
      .filter(({ isTransparent }) => isTransparent)
      .map(({ id }) => id)
  )
);

/**
 * Structures drawn fully opaque.
 */
const opaqueStructures = computed<StructureEntity[]>(() =>
  structureEntitiesFromIdentifiers(
    currentExperiment.atlas,
    terminologyRows.value,
    currentExperiment.visibleStructures
      .filter(({ isTransparent }) => !isTransparent)
      .map(({ id }) => id)
  )
);

const surfaceMaterialSettings = computed<SurfaceMaterialSettings>(() => ({
  specularIntensity: preferences.materialSpecularIntensity,
  specularPower: preferences.materialSpecularPower
}));

const probeGeometry = computed<ProbeGeometry>(() => ({
  shankThicknessMillimeters: preferences.probeShankThicknessMillimeters,
  headStageLengthMillimeters: preferences.probeHeadStageLengthMillimeters,
  headStageCutDepthMillimeters: preferences.probeHeadStageCutDepthMillimeters,
  rodDiameterMillimeters: preferences.probeRodDiameterMillimeters,
  rodLengthMillimeters: preferences.probeRodLengthMillimeters
}));

/**
 * Whether the gizmo toolbar is shown: the camera and the world have no
 * gizmo, and a locked probe or scene object gets none either.
 */
const isGizmoToolbarVisible = computed(() => {
  const selected = currentExperiment.selectedInspectable;
  if (
    !selected ||
    selected.inspectableKind === "camera" ||
    selected.inspectableKind === "world"
  ) {
    return false;
  }
  return !selected.lock;
});

/** Whether the selection can be scaled: scene objects, and a body model under the gizmo. */
const isScaleGizmoAvailable = computed(
  () =>
    currentExperiment.selectedInspectable?.inspectableKind === "sceneObject" ||
    currentExperiment.bodyModelGizmoProbeId !== null
);

/** Transform-mode toggle options, offering scale only for scene objects. */
const gizmoModeOptions = computed(() => [
  {
    label: t("sceneCanvas.gizmoPosition"),
    value: "position",
    icon: "sym_o_point_scan"
  },
  {
    label: t("sceneCanvas.gizmoRotation"),
    value: "rotation",
    icon: "flip_camera_android"
  },
  ...(isScaleGizmoAvailable.value
    ? [
        {
          label: t("sceneCanvas.gizmoScale"),
          value: "scale",
          icon: "sym_o_pan_zoom"
        }
      ]
    : [])
]);

/** Meshes of a colliding entity, whichever kind it is. */
function collisionEntityMeshes(scene: Scene, entityId: string): Mesh[] {
  const probeMeshes = getProbeMeshes(scene, entityId);
  return probeMeshes.length
    ? probeMeshes
    : getSceneObjectMeshes(scene, entityId);
}

/** Display name of a colliding entity, or null when it is gone. */
function collisionEntityName(entityId: string): string | null {
  return (
    currentExperiment.probes.find(({ id }) => id === entityId)?.name ??
    currentExperiment.sceneObjects.find(({ id }) => id === entityId)?.name ??
    null
  );
}

/**
 * Trigger engine resizing on page area resize.
 */
function onResize() {
  runtime.engine.value?.resize();

  const camera = runtime.camera.value;
  if (!camera) return;

  applyCameraProjection(camera, preferences.cameraProjection);
}

watchEffect(async () => {
  const scene = runtime.scene.value;
  if (!scene) return;

  const areInteriorsHidden = preferences.areStructureInteriorsHidden;

  isLoadingStructures.value = true;
  try {
    await syncStructuresVisibility(
      scene,
      currentExperiment.atlas,
      fadedStructures.value,
      opaqueStructures.value
    );
  } catch {
    notifyWarning(
      t("sceneCanvas.problemLoadingAtlasMeshes"),
      t("sceneCanvas.atlasLikelyNotSupportedYet")
    );
  } finally {
    setStructureInteriorsHidden(scene, areInteriorsHidden);
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
  [runtime.scene, () => currentExperiment.areAxisGuidesVisible],
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

  if (!currentExperiment.areAxisGuidesVisible) {
    clearAxisGuides(scene, guides);
    return;
  }

  buildAxisGuides(scene, guides, currentExperiment.atlas);
});

watch([runtime.scene, runtime.camera], ([scene, camera]) => {
  if (!scene || !camera) return;

  const tracker = trackAxisViewProjection(
    camera,
    () => preferences.cameraProjection,
    projection => {
      preferences.cameraProjection = projection;
    }
  );
  const observer = orbitCameraFromAxisGuideDoubleTap(scene, camera, direction =>
    tracker.sendTo(direction)
  );
  onWatcherCleanup(() => {
    observer.remove();
    tracker.dispose();
  });
});

watchEffect(() => {
  const camera = runtime.camera.value;
  if (!camera) return;

  camera.inertia = preferences.cameraInertia;
});

watchEffect(() => {
  const camera = runtime.camera.value;
  if (!camera) return;

  applyCameraProjection(camera, preferences.cameraProjection);
});

// The orthographic frustum is sized from the camera's radius, so zooming or
// orbiting has to re-derive it. Cheap in perspective mode, where the call
// just re-clears the four ortho bounds.
watch(runtime.camera, camera => {
  if (!camera) return;

  const observer = camera.onViewMatrixChangedObservable.add(() => {
    applyCameraProjection(camera, preferences.cameraProjection);
  });
  onWatcherCleanup(() => observer.remove());
});

watchEffect(() => {
  const scene = runtime.scene.value;
  if (!scene) return;

  setSceneBackgroundColor(scene, preferences.worldBackgroundColor);
});

watchEffect(() => {
  const scene = runtime.scene.value;
  if (!scene) return;

  setHemisphericLightIntensity(scene, preferences.worldLightIntensity);
});

// SSAO bakes its render ratio into its post-processes, so a ratio change rebuilds the pipeline.
watch(
  [
    runtime.scene,
    runtime.camera,
    () => preferences.isSsaoEnabled,
    () => preferences.ssaoRatio
  ],
  ([scene, camera, isEnabled, ratio]) => {
    if (!scene || !camera || !isEnabled || !isSsaoSupported()) return;

    const pipeline = attachSsaoPipeline(scene, camera, ratio);
    ssaoPipeline.value = pipeline;
    onWatcherCleanup(() => {
      detachSsaoPipeline(pipeline);
      ssaoPipeline.value = null;
    });
  }
);

// Occlusion radius and depth cutoff are in millimetres, so they track the atlas's size.
watchEffect(() => {
  const pipeline = ssaoPipeline.value;
  if (!pipeline) return;

  scaleSsaoToAtlas(
    pipeline,
    getAtlasLongestDimensionMillimeters(currentExperiment.atlas)
  );
});

watchEffect(() => {
  const scene = runtime.scene.value;
  if (!scene) return;

  syncSceneMaterials(scene, surfaceMaterialSettings.value);
});

// Materials built after the sync above (a new probe, a newly visible
// structure) still need the current specular settings.
watch(runtime.scene, scene => {
  if (!scene) return;

  const observer = applySurfaceMaterialSettingsToNewMaterials(
    scene,
    () => surfaceMaterialSettings.value
  );
  onWatcherCleanup(() => observer.remove());
});

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
    currentExperiment.draggedProbeId,
    probeGeometry.value
  );

  // A rebuilt probe loses its body model node, so the gizmo cannot stay on it.
  const bodyModelGizmoProbeId = currentExperiment.bodyModelGizmoProbeId;
  if (
    bodyModelGizmoProbeId &&
    rebuiltProbeIds.includes(bodyModelGizmoProbeId)
  ) {
    currentExperiment.bodyModelGizmoProbeId = null;
  }

  const selectedInspectable = currentExperiment.selectedInspectable;
  if (
    selectionOutlineLayer &&
    selectedInspectable?.inspectableKind === "probe" &&
    rebuiltProbeIds.includes(selectedInspectable.id)
  ) {
    selectFromSelectedInspectableState(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      selectedInspectable,
      currentExperiment.bodyModelGizmoProbeId
    );
  }

  const highlightLayer = runtime.highlightLayer.value;
  if (highlightLayer) {
    const keptEntityIds = [
      ...currentExperiment.probes.map(({ id }) => id),
      ...currentExperiment.sceneObjects.map(({ id }) => id)
    ].filter(id => !rebuiltProbeIds.includes(id));
    for (const entityId of pruneCollisions(collisionState, keptEntityIds)) {
      syncCollisionHighlight(
        highlightLayer,
        collisionState,
        entityId,
        collisionEntityMeshes(scene, entityId)
      );
    }
  }
});

/**
 * Sync scene objects from state: builds each object's node from its stored
 * model file (loading it lazily), then applies color, visibility, and pose.
 */
async function syncSceneObjectsFromState() {
  const scene = runtime.scene.value;
  const gizmoManager = runtime.gizmoManager.value;
  if (!scene || !gizmoManager) return;

  const { failedIds, colliderFailedIds, colliderChangedIds } =
    await syncSceneObjects(
      scene,
      currentExperiment.experiment,
      gizmoManager,
      sceneObjectSyncState,
      currentExperiment.draggedSceneObjectId,
      getSceneModel
    );
  if (failedIds.length) {
    notifyError(
      t("sceneCanvas.sceneObjectUnavailable"),
      t("sceneCanvas.sceneObjectUnavailableCaption")
    );
  }
  if (colliderFailedIds.length) {
    notifyWarning(
      t("sceneCanvas.sceneObjectColliderUnavailable"),
      t("sceneCanvas.sceneObjectColliderUnavailableCaption")
    );
  }

  // Havok emits no TRIGGER_EXITED when a body is disposed while overlapping
  // (e.g. `collidable` turned off, or a scale change re-cooked the hull), so
  // force-drop any stale pair for these ids rather than leaving them
  // permanently highlighted/notified as colliding. Unlike a rebuilt probe -
  // whose old, highlighted mesh is disposed along with its collider - a
  // scene object's mesh survives, so its own highlight needs resyncing too.
  const highlightLayer = runtime.highlightLayer.value;
  if (colliderChangedIds.length && highlightLayer) {
    const keptEntityIds = [
      ...currentExperiment.probes.map(({ id }) => id),
      ...currentExperiment.sceneObjects.map(({ id }) => id)
    ].filter(id => !colliderChangedIds.includes(id));
    const affectedIds = new Set([
      ...pruneCollisions(collisionState, keptEntityIds),
      ...colliderChangedIds
    ]);
    for (const entityId of affectedIds) {
      syncCollisionHighlight(
        highlightLayer,
        collisionState,
        entityId,
        collisionEntityMeshes(scene, entityId)
      );
    }
  }
}

// Re-run the sync when the scene/gizmo manager become ready or the dragged
// id changes, and separately on any scene object data change. Split across
// two watchers so `deep: true` only ever traverses the plain-object
// `sceneObjects` state -- deep-watching `runtime.scene`/`runtime.gizmoManager`
// would walk into the live Babylon `Scene`/`GizmoManager` instances and trip
// getters with real side effects (e.g. `Scene.depthPeelingRenderer` lazily
// building a renderer).
watch(
  [
    runtime.scene,
    runtime.gizmoManager,
    () => currentExperiment.draggedSceneObjectId
  ],
  syncSceneObjectsFromState,
  { immediate: true }
);
watch(() => currentExperiment.sceneObjects, syncSceneObjectsFromState, {
  deep: true
});

/**
 * Sync probe body models from state: builds each from its stored file
 * (loading it lazily), then applies visibility and local pose, and cooks the
 * probe's convex-hull collider.
 */
async function syncProbeBodyModelsFromState() {
  const scene = runtime.scene.value;
  const gizmoManager = runtime.gizmoManager.value;
  if (!scene || !gizmoManager) return;

  const { failedIds, colliderFailedIds, colliderChangedIds } =
    await syncProbeBodyModels(
      scene,
      currentExperiment.experiment,
      gizmoManager,
      probeBodyModelSyncState,
      currentExperiment.draggedProbeId,
      getSceneModel
    );
  if (failedIds.length) {
    notifyError(
      t("sceneCanvas.probeBodyModelUnavailable"),
      t("sceneCanvas.probeBodyModelUnavailableCaption")
    );
  }
  if (colliderFailedIds.length) {
    notifyWarning(
      t("sceneCanvas.probeBodyModelColliderUnavailable"),
      t("sceneCanvas.probeBodyModelColliderUnavailableCaption")
    );
  }

  // Havok emits no TRIGGER_EXITED when a body is disposed while overlapping
  // (e.g. attaching, replacing, or re-cooking the hull for a new pose), so
  // force-drop any stale pair for these ids rather than leaving them
  // permanently highlighted/notified as colliding.
  const highlightLayer = runtime.highlightLayer.value;
  if (colliderChangedIds.length && highlightLayer) {
    const keptEntityIds = [
      ...currentExperiment.probes.map(({ id }) => id),
      ...currentExperiment.sceneObjects.map(({ id }) => id)
    ].filter(id => !colliderChangedIds.includes(id));
    const affectedIds = new Set([
      ...pruneCollisions(collisionState, keptEntityIds),
      ...colliderChangedIds
    ]);
    for (const entityId of affectedIds) {
      syncCollisionHighlight(
        highlightLayer,
        collisionState,
        entityId,
        collisionEntityMeshes(scene, entityId)
      );
    }
  }
}

watch(
  [runtime.scene, runtime.gizmoManager, () => currentExperiment.draggedProbeId],
  syncProbeBodyModelsFromState,
  { immediate: true }
);
watch(() => currentExperiment.probes, syncProbeBodyModelsFromState, {
  deep: true
});

// A reopened experiment can supply a model that was missing last time.
watch(
  () => currentExperiment.experiment.id,
  () => {
    sceneObjectSyncState.failedIds.clear();
    probeBodyModelSyncState.failedIds.clear();
  }
);

// Highlight and warn about scene entities whose bodies overlap.
watch(
  [runtime.havokPlugin, runtime.highlightLayer, runtime.scene],
  ([plugin, highlightLayer, scene]) => {
    if (!plugin || !highlightLayer || !scene) return;

    collisionState.pairCounts.clear();
    const observer = trackCollisions(plugin, collisionState, change => {
      for (const entityId of change.entityIds) {
        syncCollisionHighlight(
          highlightLayer,
          collisionState,
          entityId,
          collisionEntityMeshes(scene, entityId)
        );
      }
      if (change.kind !== "entered") return;

      // The lexicographically lower entity id comes first, so exactly one entity of the pair
      // names itself as the notification's subject.
      const [firstId, secondId] = change.entityIds;
      const first = collisionEntityName(firstId);
      const second = collisionEntityName(secondId);
      if (!first || !second) return;

      notifyError(
        t("sceneCanvas.entityCollision", { first, second }),
        t("sceneCanvas.entityCollisionCaption")
      );
    });
    onWatcherCleanup(() => observer.remove());
  }
);

// Draw the pending surface-move choice's tubes, or clear them once resolved.
watchEffect(() => {
  const scene = runtime.scene.value;
  if (!scene) return;

  const choice = currentExperiment.probeSurfaceChoice;
  if (!choice) {
    disposeProbeSurfacePaths(scene);
    return;
  }
  buildProbeSurfacePaths(scene, choice);
});

// Drop a pending surface-move choice once its probe moves or disappears -
// deselecting the probe unmounts its inspector, so this cancellation path
// lives here rather than there.
watchEffect(() => {
  const choice = currentExperiment.probeSurfaceChoice;
  if (!choice) return;

  const probe = currentExperiment.probes.find(
    ({ id }) => id === choice.probeId
  );
  if (!probe || !isProbeSurfaceChoiceCurrent(choice, probe)) {
    currentExperiment.probeSurfaceChoice = null;
  }
});

// Drop the body model gizmo when its probe stops being the selected, unlocked
// probe that still carries a model - deselecting, locking, or undoing the
// model away all leave the gizmo with nothing to drive.
watchEffect(() => {
  const probeId = currentExperiment.bodyModelGizmoProbeId;
  if (!probeId) return;

  const selected = currentExperiment.selectedInspectable;
  const probe = currentExperiment.probes.find(({ id }) => id === probeId);
  if (
    selected?.inspectableKind !== "probe" ||
    selected.id !== probeId ||
    !probe?.bodyModel ||
    probe.lock
  ) {
    currentExperiment.bodyModelGizmoProbeId = null;
  }
});

// Resolve the user's tube pick into a probe move.
watch(runtime.scene, scene => {
  if (!scene) return;

  const observer = pickProbeSurfacePathOnTap(scene, kind => {
    const choice = currentExperiment.probeSurfaceChoice;
    if (!choice) return;

    const probe = currentExperiment.probes.find(
      ({ id }) => id === choice.probeId
    );
    // Clear before mutating, so the cancel effect never sees the applied
    // move as a user-driven cancellation.
    currentExperiment.probeSurfaceChoice = null;
    // `Probe.lock` documents the probe as locked against pose edits, so a
    // probe locked while its choice was pending drops the move instead of
    // applying it.
    if (!probe || probe.lock) return;

    setProbeTipMillimeters(
      probe,
      kind === "axis"
        ? choice.axisTargetMillimeters
        : choice.dorsoventralTargetMillimeters,
      currentExperiment.referenceCoordinate
    );
  });
  onWatcherCleanup(() => observer.remove());
});

// Reset the toggle to position if the selection stops being scalable (e.g. a
// probe is selected) while the scale gizmo is active, so the toggle never
// ends up with no active option and a scale gizmo left attached.
watch(isScaleGizmoAvailable, available => {
  if (!available && gizmoMode.value === "scale") gizmoMode.value = "position";
});

// Configure the gizmos from the control bar and keep the probe and scene
// object drag observers on them.
watch(
  [
    runtime.gizmoManager,
    () => currentExperiment.probes,
    () => currentExperiment.sceneObjects,
    gizmoMode,
    gizmoCoordinateSpace
  ],
  ([gizmoManager, probes, sceneObjects, mode, coordinateSpace]) => {
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
      currentExperiment.endProbeDrag();
    });

    const sceneObjectPositionDraggingObserver =
      setSceneObjectPositionFromGizmoDrag(
        gizmos.positionGizmo,
        sceneObjects,
        sceneObjectId => {
          currentExperiment.draggedSceneObjectId = sceneObjectId;
        }
      );
    const sceneObjectRotationDraggingObserver =
      setSceneObjectRotationFromGizmoDrag(
        gizmos.rotationGizmo,
        sceneObjects,
        sceneObjectId => {
          currentExperiment.draggedSceneObjectId = sceneObjectId;
        }
      );
    const sceneObjectScaleDraggingObserver = setSceneObjectScaleFromGizmoDrag(
      gizmos.scaleGizmo,
      sceneObjects,
      sceneObjectId => {
        currentExperiment.draggedSceneObjectId = sceneObjectId;
      }
    );
    const sceneObjectDragEndObservers = endSceneObjectGizmoDrag(gizmos, () => {
      currentExperiment.endSceneObjectDrag();
    });

    const bodyModelPositionDraggingObserver =
      setProbeBodyModelPositionFromGizmoDrag(
        gizmos.positionGizmo,
        probes,
        probeId => {
          currentExperiment.draggedProbeId = probeId;
        }
      );
    const bodyModelRotationDraggingObserver =
      setProbeBodyModelRotationFromGizmoDrag(
        gizmos.rotationGizmo,
        probes,
        probeId => {
          currentExperiment.draggedProbeId = probeId;
        }
      );
    const bodyModelScaleDraggingObserver = setProbeBodyModelScaleFromGizmoDrag(
      gizmos.scaleGizmo,
      probes,
      probeId => {
        currentExperiment.draggedProbeId = probeId;
      }
    );
    const bodyModelDragEndObservers = endProbeBodyModelGizmoDrag(gizmos, () => {
      currentExperiment.endProbeDrag();
    });

    onWatcherCleanup(() => {
      probePositionDraggingObserver.remove();
      probeRotationDraggingObserver.remove();
      probeDragEndObservers.forEach(observer => observer.remove());
      sceneObjectPositionDraggingObserver.remove();
      sceneObjectRotationDraggingObserver.remove();
      sceneObjectScaleDraggingObserver.remove();
      sceneObjectDragEndObservers.forEach(observer => observer.remove());
      bodyModelPositionDraggingObserver.remove();
      bodyModelRotationDraggingObserver.remove();
      bodyModelScaleDraggingObserver.remove();
      bodyModelDragEndObservers.forEach(observer => observer.remove());
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
    () => currentExperiment.probes,
    () => currentExperiment.sceneObjects
  ],
  ([scene, gizmoManager, selectionOutlineLayer, probes, sceneObjects]) => {
    if (!scene || !gizmoManager || !selectionOutlineLayer) return;

    const probeSelectionObserver = selectProbeFromGizmoAttach(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      probes,
      (probe, probeNode) =>
        getProbeGizmoNode(
          scene,
          probe,
          probeNode,
          currentExperiment.bodyModelGizmoProbeId
        ),
      probe => {
        currentExperiment.selectedInspectable = probe;
      }
    );

    const sceneObjectSelectionObserver = selectSceneObjectFromGizmoAttach(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      sceneObjects,
      sceneObject => {
        currentExperiment.selectedInspectable = sceneObject;
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
      sceneObjectSelectionObserver.remove();
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
    currentExperiment.selectedInspectable,
    currentExperiment.bodyModelGizmoProbeId
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
    <canvas ref="canvas" class="fit non-selectable" />
    <q-linear-progress
      v-if="isLoadingStructures || currentExperiment.isLoadingRegionCenter"
      indeterminate
      color="primary"
      size="lg"
      class="absolute-top"
    />
  </div>
  <q-resize-observer @resize="onResize" />
  <q-page-sticky
    v-if="isGizmoToolbarVisible"
    :offset="[0, 18]"
    position="bottom"
  >
    <q-card>
      <q-card-section class="row justify-center gizmo-controls">
        <q-btn-toggle
          v-model="gizmoMode"
          :aria-label="$t('sceneCanvas.gizmoMode')"
          :options="gizmoModeOptions"
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
