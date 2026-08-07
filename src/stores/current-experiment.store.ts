import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { computedAsync, useRefHistory } from "@vueuse/core";
import { i18n } from "@/services/i18n.service";
import {
  ALLEN_MOUSE_REFERENCE_COORDINATE,
  buildDefaultVisibleStructures,
  cloneExperiment,
  type Experiment
} from "@/features/experiment";
import {
  DEFAULT_ATLAS,
  getDefaultStructureIdentifiers,
  getTerminologyRows,
  isEqualAtlas
} from "@/features/atlas";
import {
  detachProbeInterfaceProbes,
  type ProbeSurfaceChoice
} from "@/features/probe";
import type { Inspectable } from "@/features/scene";
import { isSameInspectable } from "@/features/scene";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";

/** Store actions reachable through the hydration hook's untyped `context.store`. */
interface HydratedCurrentExperimentStore {
  resetHistory: () => void;
}

export const useCurrentExperimentStore = defineStore(
  "current-experiment",
  () => {
    const recentExperimentsStore = useRecentExperimentsStore();

    /**
     * Current experiment instance.
     */
    const experiment = ref<Experiment>({
      id: crypto.randomUUID(),
      version: import.meta.env.APP_VERSION,
      name: i18n.global.t("currentExperiment.defaultName"),
      atlas: structuredClone(DEFAULT_ATLAS),
      referenceCoordinate: [...ALLEN_MOUSE_REFERENCE_COORDINATE],
      // `allen_mouse` has a known default-structure list, so no terminology
      // rows are needed to resolve it.
      visibleStructures: buildDefaultVisibleStructures(
        getDefaultStructureIdentifiers(DEFAULT_ATLAS.name, [])
      ),
      probeInterfaceProbes: {},
      probes: [],
      cameraPoses: []
    });

    /** Currently selected inspectable, or null if nothing is selected. */
    const selectedInspectable = ref<Inspectable | null>(null);

    /** ID of the probe currently being dragged, or null. */
    const draggedProbeId = ref<string | null>(null);

    /** Pending surface-move choice awaiting the user's pick, or null. */
    const probeSurfaceChoice = ref<ProbeSurfaceChoice | null>(null);

    /** Are the atlas axis guides shown in the scene. */
    const areAxisGuidesVisible = ref(false);

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
      // A gizmo drag rewrites the probe pose every frame; drop those in-between
      // states and let `endProbeDrag` record the pose the drag was released at.
      eventFilter: invoke => {
        if (!draggedProbeId.value) invoke();
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

    /** Probes in the current experiment. */
    const probes = computed(() => experiment.value.probes);

    /** Saved camera poses in the current experiment. */
    const cameraPoses = computed(() => experiment.value.cameraPoses);

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
     * Re-point the selection at the matching probe in the current experiment,
     * clearing it when that probe is no longer there.
     */
    function resyncSelectedInspectable() {
      const selected = selectedInspectable.value;
      if (selected?.inspectableKind !== "probe") return;

      selectedInspectable.value =
        experiment.value.probes.find(({ id }) => id === selected.id) ?? null;
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
    }

    const state = {
      experiment,
      selectedInspectable,
      draggedProbeId,
      probeSurfaceChoice,
      isTerminologyRowsEvaluating,
      areAxisGuidesVisible
    };
    const getters = {
      name,
      atlas,
      terminologyRows,
      referenceCoordinate,
      visibleStructures,
      probeInterfaceProbes,
      probes,
      cameraPoses,
      canUndo,
      canRedo
    };
    const actions = {
      isInspectableSelected,
      loadExperiment,
      undo,
      redo,
      resetHistory,
      endProbeDrag
    };
    return { ...state, ...getters, ...actions };
  },
  {
    persist: {
      pick: ["experiment"],

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
