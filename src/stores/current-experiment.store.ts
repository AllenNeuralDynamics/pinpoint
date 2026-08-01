import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { computedAsync } from "@vueuse/core";
import { i18n } from "@/services/i18n.service";
import type { Experiment } from "@/features/experiment";
import type { Manifest } from "@/features/atlas";
import {
  BRAINGLOBE_BASE_URL,
  getManifest,
  getTerminologyRows
} from "@/features/atlas";
import {
  detachProbeInterfaceProbe,
  normalizeProbeSliceView
} from "@/features/probe";
import type { Inspectable } from "@/features/scene";
import { isSameInspectable } from "@/features/scene";

export const useCurrentExperimentStore = defineStore(
  "current-experiment",
  () => {
    /**
     * Current experiment instance.
     */
    const experiment = ref<Experiment>({
      name: i18n.global.t("currentExperiment.defaultName"),
      atlas: {
        source: BRAINGLOBE_BASE_URL,
        name: "allen_mouse"
      },
      referenceCoordinate: [5.7, 0.44, 5.4],
      visibleStructures: [],
      probeInterfaceProbes: {},
      probes: []
    });

    const selectedInspectable = ref<Inspectable | null>(null);

    /**
     * ID of the probe currently being dragged.
     *
     * Used to ignore updates from pinia going to writing the probe's location.
     */
    const draggedProbeId = ref<string | null>(null);

    /**
     * Flag for when the manifest is being updated to match the new atlas.
     */
    const isManifestEvaluating = ref(false);

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
     * Manifest of the current atlas.
     */
    const manifest = computedAsync<Manifest | null>(
      async () => await getManifest(atlas.value),
      null,
      isManifestEvaluating
    );

    /**
     * Terminology rows of the current atlas.
     */
    const terminologyRows = computedAsync(
      async () =>
        manifest.value ? await getTerminologyRows(manifest.value) : [],
      [],
      isTerminologyRowsEvaluating
    );

    /**
     * Are the getters into the current atlas still evaluating.
     */
    const areAtlasComponentsEvaluating = computed(
      () => isManifestEvaluating.value || isTerminologyRowsEvaluating.value
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
    const visibleStructures = computed({
      get: () => experiment.value.visibleStructures,
      set: (value: number[]) => (experiment.value.visibleStructures = value)
    });

    /**
     * Probe interface definitions used by this experiment's probes, keyed by
     * probe identifier.
     */
    const probeInterfaceProbes = computed(
      () => experiment.value.probeInterfaceProbes
    );

    const probes = computed(() => experiment.value.probes);

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

    const state = {
      experiment,
      selectedInspectable,
      draggedProbeId,
      isManifestEvaluating
    };
    const getters = {
      name,
      atlas,
      manifest,
      terminologyRows,
      areAtlasComponentsEvaluating,
      referenceCoordinate,
      visibleStructures,
      probeInterfaceProbes,
      probes
    };
    const actions = { isInspectableSelected };
    return { ...state, ...getters, ...actions };
  },
  {
    persist: {
      pick: ["experiment"],

      // Re-mark probe interface definitions as raw to prevent tracking, and
      // fill in probe fields missing from experiments persisted before they
      // existed.
      afterHydrate: context => {
        const experiment: Experiment = context.store.experiment;
        for (const [identifier, definition] of Object.entries(
          experiment.probeInterfaceProbes
        )) {
          experiment.probeInterfaceProbes[identifier] =
            detachProbeInterfaceProbe(definition);
        }
        for (const probe of experiment.probes) {
          normalizeProbeSliceView(probe);
        }
      }
    }
  }
);
