import { defineStore } from "pinia";
import { computed, ref, toRaw, watch } from "vue";
import { computedAsync, useRefHistory } from "@vueuse/core";
import { i18n } from "@/services/i18n.service";
import {
  buildExperiment,
  buildInitialReferenceCoordinate,
  cloneExperiment,
  type Experiment,
  isExperiment,
  setExperimentGlobalCoordinateSystem,
  setExperimentLocalCoordinateSystem,
  updateInternedCoordinateSystem
} from "@/features/experiment";
import {
  DEFAULT_ATLAS,
  getDefaultStructureIdentifiers,
  getTerminologyRows,
  isEqualAtlas
} from "@/features/atlas";
import {
  detachProbeInterfaceProbes,
  type ProbeGhost,
  type ProbeSurfaceChoice,
  type ProbeSurfaceMarker
} from "@/features/probe";
import type { CoordinateSystemNodeComponent } from "@/features/coordinate-system";
import type { Inspectable } from "@/features/scene";
import { isSameInspectable } from "@/features/scene";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";
import { useCoordinateSystemLibraryStore } from "@/stores/coordinate-system-library.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import {
  getAxisDirections,
  type AxisDirections,
  type GlobalCoordinateSystem,
  type LocalCoordinateSystem
} from "@/utils/coordinate-frame";
import { isRecord } from "@/utils/type-guards";

/** Store actions reachable through the hydration hook's untyped `context.store`. */
interface HydratedCurrentExperimentStore {
  resetHistory: () => void;
}

export const useCurrentExperimentStore = defineStore(
  "current-experiment",
  () => {
    const recentExperimentsStore = useRecentExperimentsStore();
    const coordinateSystemLibraryStore = useCoordinateSystemLibraryStore();
    const preferencesStore = usePreferencesStore();

    /**
     * Current experiment instance.
     */
    const experiment = ref<Experiment>(buildInitialExperiment());

    /**
     * Build the experiment the app opens with, in the coordinate systems new
     * scenes start in.
     */
    function buildInitialExperiment(): Experiment {
      const atlas = structuredClone(DEFAULT_ATLAS);
      const globalCoordinateSystem = structuredClone(
        toRaw(preferencesStore.newSceneGlobalCoordinateSystem)
      );
      const localCoordinateSystem = structuredClone(
        toRaw(preferencesStore.newSceneLocalCoordinateSystem)
      );
      return buildExperiment(
        i18n.global.t("currentExperiment.defaultName"),
        atlas,
        globalCoordinateSystem,
        localCoordinateSystem,
        buildInitialReferenceCoordinate(atlas, globalCoordinateSystem),
        // `allen_mouse` has a known default-structure list, so no terminology
        // rows are needed to resolve it.
        getDefaultStructureIdentifiers(DEFAULT_ATLAS.name, [])
      );
    }

    /** Currently selected inspectable, or null if nothing is selected. */
    const selectedInspectable = ref<Inspectable | null>(null);

    /** ID of the probe currently being dragged, or null. */
    const draggedProbeId = ref<string | null>(null);

    /** ID of the scene object currently being dragged, or null. */
    const draggedSceneObjectId = ref<string | null>(null);

    /** Probe id whose body model currently holds the transform gizmo, or null. */
    const bodyModelGizmoProbeId = ref<string | null>(null);

    /** Chain index of the selected coordinate system's node the user is editing, or null. */
    const focusedCoordinateSystemNodeIndex = ref<number | null>(null);

    /** Which of the focused node's triples labels its gimbal axes. */
    const focusedCoordinateSystemComponent =
      ref<CoordinateSystemNodeComponent>("position");

    /** Is the camera mid-movement, streaming its pose into the experiment. */
    const isCameraMoving = ref(false);

    /** Pending surface-move choice awaiting the user's pick, or null. */
    const probeSurfaceChoice = ref<ProbeSurfaceChoice | null>(null);

    /** Translucent clone drawn at the closest reachable pose while a drag can't be solved, or null. */
    const probeGhost = ref<ProbeGhost | null>(null);

    /** Sphere drawn where the inspected probe's chain solves its on-surface node, or null. */
    const probeSurfaceMarker = ref<ProbeSurfaceMarker | null>(null);

    /** Are the atlas axis guides shown in the scene. */
    const areAxisGuidesVisible = ref(false);

    /** Is a brain region's mesh being resolved for a region-center move. */
    const isLoadingRegionCenter = ref(false);

    /**
     * Flag for when the terminology rows are being updated to match the new atlas.
     */
    const isTerminologyRowsEvaluating = ref(false);

    /**
     * Unlimited, deep-tracked undo/redo history of the current experiment.
     * Never persisted, so it starts empty on every page load.
     */
    const {
      canUndo,
      canRedo,
      undo: undoExperiment,
      redo: redoExperiment,
      commit: commitHistory,
      clear: clearHistory
    } = useRefHistory(experiment, {
      deep: true,
      clone: cloneExperiment,
      // A gizmo drag rewrites the pose every frame for either entity kind, and a
      // camera movement streams its own pose the same way; drop those in-between
      // states and let `endProbeDrag`/`endSceneObjectDrag`/`endCameraMove` record
      // the pose the movement ended at.
      eventFilter: invoke => {
        if (
          !draggedProbeId.value &&
          !draggedSceneObjectId.value &&
          !isCameraMoving.value
        ) {
          invoke();
        }
      }
    });

    /**
     * Get the current experiment name.
     */
    const name = computed(() => experiment.value.name);

    /** Latest atlas object handed out by `atlas`, replaced only on a real change. */
    let lastAtlas = experiment.value.atlas;

    /**
     * Get the current experiment atlas, keeping the previous object while its
     * value is unchanged so undo/redo's whole-experiment clone does not look
     * like an atlas change to atlas-derived work.
     * @remarks Depends on the atlas only ever being replaced wholesale, never
     * edited field by field - an in-place edit would keep this reference and so
     * would not propagate.
     */
    const atlas = computed(() => {
      const next = experiment.value.atlas;
      if (!isEqualAtlas(lastAtlas, next)) lastAtlas = next;
      return lastAtlas;
    });

    /**
     * Terminology rows of the current atlas.
     */
    const terminologyRows = computedAsync(
      async () => await getTerminologyRows(atlas.value),
      [],
      isTerminologyRowsEvaluating
    );

    /**
     * Get the current experiment's reference coordinate.
     */
    const referenceCoordinate = computed(
      () => experiment.value.referenceCoordinate
    );

    /**
     * Coordinate system this experiment's coordinates are expressed in.
     */
    const globalCoordinateSystem = computed(
      () => experiment.value.globalCoordinateSystem
    );

    /**
     * Directions of the current coordinate system's axes, which every
     * conversion into atlas or scene space takes.
     */
    const axisDirections = computed<AxisDirections>(() =>
      getAxisDirections(experiment.value.globalCoordinateSystem)
    );

    /**
     * Orientation this experiment's probes rest in before their own transforms.
     */
    const localCoordinateSystem = computed(
      () => experiment.value.localCoordinateSystem
    );

    /**
     * Re-express the experiment in another coordinate system, keeping its
     * geometry in place, and retain it for new scenes when asked to.
     * @param system Coordinate system to express coordinates in.
     */
    function setGlobalCoordinateSystem(system: GlobalCoordinateSystem): void {
      setExperimentGlobalCoordinateSystem(experiment.value, system);
      if (preferencesStore.areCoordinateSystemsRetained) {
        preferencesStore.newSceneGlobalCoordinateSystem = structuredClone(
          toRaw(system)
        );
      }
    }

    /**
     * Point the experiment's probes at another resting orientation, and retain
     * it for new scenes when asked to.
     * @param system Orientation the experiment's probes rest in.
     */
    function setLocalCoordinateSystem(system: LocalCoordinateSystem): void {
      setExperimentLocalCoordinateSystem(experiment.value, system);
      if (preferencesStore.areCoordinateSystemsRetained) {
        preferencesStore.newSceneLocalCoordinateSystem = structuredClone(
          toRaw(system)
        );
      }
    }

    /**
     * List of structure identifiers actively being shown in the atlas.
     */
    const visibleStructures = computed(
      () => experiment.value.visibleStructures
    );

    /**
     * Probe interface definitions used by this experiment's probes, keyed by
     * probe identifier.
     */
    const probeInterfaceProbes = computed(
      () => experiment.value.probeInterfaceProbes
    );

    /**
     * Coordinate system definitions used by this experiment's probes, keyed by
     * coordinate system identifier.
     */
    const coordinateSystems = computed(
      () => experiment.value.coordinateSystems
    );

    /** Probes in the current experiment. */
    const probes = computed(() => experiment.value.probes);

    /** Scene objects in the current experiment. */
    const sceneObjects = computed(() => experiment.value.sceneObjects);

    /** Saved camera poses in the current experiment. */
    const cameraPoses = computed(() => experiment.value.cameraPoses);

    /** Live camera pose in the current experiment. */
    const cameraPose = computed(() => experiment.value.cameraPose);

    /**
     * Is the passed entity the actively selected one.
     * @param entity Entity to compare against the current selection.
     */
    function isInspectableSelected(entity: Inspectable): boolean {
      return (
        !!selectedInspectable.value &&
        isSameInspectable(selectedInspectable.value, entity)
      );
    }

    /** Step the experiment back one history point, if there is one. */
    function undo() {
      undoExperiment();
      resyncSelectedInspectable();
    }

    /** Step the experiment forward one history point, if there is one. */
    function redo() {
      redoExperiment();
      resyncSelectedInspectable();
    }

    /**
     * Discard all undo/redo history, making the current experiment the baseline.
     * @remarks Also swallows the pending commit for experiment mutations made
     * earlier in this tick, so replacing the experiment leaves no undo point.
     */
    function resetHistory() {
      commitHistory();
      clearHistory();
    }

    /**
     * Re-point the selection at the matching entity in the current experiment,
     * clearing it when that entity is no longer there.
     */
    function resyncSelectedInspectable() {
      const selected = selectedInspectable.value;
      if (!selected) return;

      // The world lives outside the experiment, so history never invalidates it.
      if (selected.inspectableKind === "world") return;

      // Coordinate systems live in the library store, not the experiment, so
      // history never invalidates them either.
      if (selected.inspectableKind === "coordinateSystem") return;

      if (selected.inspectableKind === "camera") {
        selectedInspectable.value = experiment.value.cameraPose;
        return;
      }
      if (selected.inspectableKind === "probe") {
        selectedInspectable.value =
          experiment.value.probes.find(({ id }) => id === selected.id) ?? null;
        return;
      }
      selectedInspectable.value =
        experiment.value.sceneObjects.find(({ id }) => id === selected.id) ??
        null;
    }

    /**
     * Finish the active probe drag, recording the released pose as a single
     * history point.
     * @remarks No-op when no drag is in progress, so a gizmo click that never
     * moved (or a second drag-end from the other gizmo) records nothing.
     */
    function endProbeDrag() {
      if (!draggedProbeId.value) return;

      draggedProbeId.value = null;
      commitHistory();
    }

    /**
     * Finish the active scene object drag, recording the released pose as a
     * single history point.
     * @remarks No-op when no drag is in progress, so a gizmo click that never
     * moved (or a second drag-end from the other gizmo) records nothing.
     */
    function endSceneObjectDrag() {
      if (!draggedSceneObjectId.value) return;

      draggedSceneObjectId.value = null;
      commitHistory();
    }

    /**
     * Finish the active camera movement, recording the pose it stopped at as a
     * single history point.
     * @remarks No-op when the camera was not moving, so a still camera's frame
     * observer, or a camera replaced between movements, records nothing.
     */
    function endCameraMove() {
      if (!isCameraMoving.value) return;

      isCameraMoving.value = false;
      commitHistory();
    }

    /**
     * Move the current experiment into recents and load in a new one.
     * @param newExperiment Experiment to load.
     */
    function loadExperiment(newExperiment: Experiment) {
      recentExperimentsStore.add(experiment.value);

      detachProbeInterfaceProbes(newExperiment.probeInterfaceProbes);
      experiment.value = newExperiment;
      resetHistory();
      selectedInspectable.value = null;
      draggedProbeId.value = null;
      probeGhost.value = null;
      probeSurfaceMarker.value = null;
      draggedSceneObjectId.value = null;
      bodyModelGizmoProbeId.value = null;
      isCameraMoving.value = false;
    }

    // A coordinate system is edited in place in the library, but the experiment holds its own
    // interned clone per identifier, so mirror every library edit onto the copies it interns.
    watch(
      () => coordinateSystemLibraryStore.library,
      library => {
        for (const coordinateSystem of library) {
          updateInternedCoordinateSystem(experiment.value, coordinateSystem);
        }
      },
      { deep: true }
    );

    const state = {
      experiment,
      selectedInspectable,
      draggedProbeId,
      draggedSceneObjectId,
      bodyModelGizmoProbeId,
      isCameraMoving,
      probeSurfaceChoice,
      probeGhost,
      probeSurfaceMarker,
      isTerminologyRowsEvaluating,
      areAxisGuidesVisible,
      isLoadingRegionCenter,
      focusedCoordinateSystemNodeIndex,
      focusedCoordinateSystemComponent
    };
    const getters = {
      name,
      atlas,
      terminologyRows,
      referenceCoordinate,
      globalCoordinateSystem,
      localCoordinateSystem,
      axisDirections,
      visibleStructures,
      probeInterfaceProbes,
      coordinateSystems,
      probes,
      sceneObjects,
      cameraPose,
      cameraPoses,
      canUndo,
      canRedo
    };
    const actions = {
      isInspectableSelected,
      setGlobalCoordinateSystem,
      setLocalCoordinateSystem,
      loadExperiment,
      undo,
      redo,
      resetHistory,
      endProbeDrag,
      endSceneObjectDrag,
      endCameraMove
    };
    return { ...state, ...getters, ...actions };
  },
  {
    persist: {
      pick: ["experiment"],

      // Hydration deep-merges the stored payload into the store's defaults, so a
      // scene written by an incompatible build would silently pick up default
      // coordinate systems and have its geometry reinterpreted in them. Reject
      // such a payload outright and keep the fresh scene instead.
      serializer: {
        serialize: JSON.stringify,
        deserialize: (value: string) => {
          const stored: unknown = JSON.parse(value);
          if (isRecord(stored) && isExperiment(stored.experiment))
            return stored;
          return {};
        }
      },

      // Re-mark probe interface definitions as raw to prevent tracking.
      afterHydrate: context => {
        const experiment: Experiment = context.store.experiment;
        detachProbeInterfaceProbes(experiment.probeInterfaceProbes);
        (
          context.store as unknown as HydratedCurrentExperimentStore
        ).resetHistory();
      }
    }
  }
);
