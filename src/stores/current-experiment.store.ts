import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { computedAsync } from "@vueuse/core";
import { i18n } from "@/services/i18n.service";
import {
  ALLEN_MOUSE_REFERENCE_COORDINATE,
  type Experiment
} from "@/features/experiment";
import { DEFAULT_ATLAS, getTerminologyRows } from "@/features/atlas";
import {
  detachProbeInterfaceProbes,
  type ProbeSurfaceChoice
} from "@/features/probe";
import type { Inspectable } from "@/features/scene";
import { isSameInspectable } from "@/features/scene";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";

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
      visibleStructures: [],
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
     * Get the current experiment name.
     */
    const name = computed(() => experiment.value.name);

    /**
     * Get the current experiment atlas.
     */
    const atlas = computed(() => experiment.value.atlas);

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

    /**
     * Move the current experiment into recents and load in a new one.
     * @param newExperiment Experiment to load.
     */
    function loadExperiment(newExperiment: Experiment) {
      recentExperimentsStore.add(experiment.value);

      detachProbeInterfaceProbes(newExperiment.probeInterfaceProbes);
      experiment.value = newExperiment;
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
      cameraPoses
    };
    const actions = { isInspectableSelected, loadExperiment };
    return { ...state, ...getters, ...actions };
  },
  {
    persist: {
      pick: ["experiment"],

      // Re-mark probe interface definitions as raw to prevent tracking.
      afterHydrate: context => {
        const experiment: Experiment = context.store.experiment;
        detachProbeInterfaceProbes(experiment.probeInterfaceProbes);
      }
    }
  }
);
