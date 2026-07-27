import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { computedAsync } from "@vueuse/core";
import { Experiment } from "@/features/experiment";
import {
  Atlas,
  BRAINGLOBE_BASE_URL,
  getDefaultStructureIdentifiers,
  getManifest,
  getTerminologyRows,
  Manifest
} from "@/features/atlas";

export const useCurrentExperimentStore = defineStore(
  "current-experiment",
  () => {
    /**
     * Current experiment instance.
     */
    const experiment = ref<Experiment>({
      name: "My First Experiment",
      atlas: {
        source: BRAINGLOBE_BASE_URL,
        name: "allen_mouse"
      },
      referenceCoordinate: [5.7, 0.44, 5.4],
      visibleStructures: []
    });

    /**
     * Create a new experiment with the given name, atlas, and reference
     * coordinate.
     * @param name Experiment name.
     * @param atlas Full atlas object.
     * @param referenceCoordinate Reference coordinate (in ASR, mm) that the
     * atlas root should be offset by.
     */
    function create(
      name: string,
      atlas: Atlas,
      referenceCoordinate: [number, number, number]
    ) {
      experiment.value = {
        name,
        atlas,
        referenceCoordinate,
        visibleStructures: []
      };
    }

    /**
     * Set the name of the experiment.
     * @param name Experiment name.
     */
    function setName(name: string) {
      experiment.value.name = name;
    }

    /**
     * Get the current experiment name.
     */
    const name = computed(() => experiment.value.name);

    /**
     * Get the current experiment atlas.
     */
    const atlas = computed(() => experiment.value.atlas);

    /**
     * Flag for when the manifest is being updated to match the new atlas.
     */
    const isManifestEvaluating = ref(false);

    /**
     * Manifest of the current atlas.
     */
    const manifest = computedAsync<Manifest | null>(
      async () => await getManifest(atlas.value),
      null,
      isManifestEvaluating
    );

    /**
     * Flag for when the terminology rows are being updated to match the new atlas.
     */
    const isTerminologyRowsEvaluating = ref(false);

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
     * Default (top-level) structure identifiers for the current experiment's
     * atlas.
     */
    const defaultStructureIdentifiers = computed<number[]>(() =>
      terminologyRows.value && !areAtlasComponentsEvaluating.value
        ? getDefaultStructureIdentifiers(terminologyRows.value)
        : []
    );

    /**
     * Set the reference coordinate of the experiment.
     * @param referenceCoordinate Reference coordinate (in ASR, mm) that the
     * atlas root should be offset by.
     */
    function setReferenceCoordinate(
      referenceCoordinate: [number, number, number]
    ) {
      experiment.value.referenceCoordinate = referenceCoordinate;
    }

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
      set: (value: number[]) => {
        experiment.value.visibleStructures = value;
      }
    });

    /**
     * Is the structure visible on the atlas in the experiment.
     * @param identifier Identifier of the structure to check.
     */
    function isStructureVisible(identifier: number) {
      return visibleStructures.value.includes(identifier);
    }

    /**
     * Set the visibility of the structure in the atlas.
     * @param identifier Identifier of the structure to set the visibility of.
     * @param value Is the structure visible or not.
     */
    function setStructureVisibility(identifier: number, value: boolean) {
      if (value) {
        if (!isStructureVisible(identifier)) {
          visibleStructures.value.push(identifier);
        }
      } else {
        const index = visibleStructures.value.indexOf(identifier);
        if (index !== -1) {
          visibleStructures.value.splice(index, 1);
        }
      }
    }

    /**
     * Reset visible structures.
     */
    function clearVisibleStructures() {
      experiment.value.visibleStructures = [];
    }

    return {
      experiment,
      visibleStructures,
      create,
      setName,
      name,
      atlas,
      manifest,
      terminologyRows,
      areAtlasComponentsEvaluating,
      defaultStructureIdentifiers,
      setReferenceCoordinate,
      referenceCoordinate,
      isStructureVisible,
      setStructureVisibility,
      clearVisibleStructures
    };
  },
  {
    // Only `experiment` is real state. `manifest` and `terminologyRows` are
    // `computedAsync`, which returns a plain
    // `shallowRef` -- pinia's `isComputed` check can't tell that apart from
    // state (it looks for a `.effect` property, which only a `computed`
    // has), so without this `pick` the entire fetched terminology CSV would
    // be persisted to `localStorage` and hydrated back on startup, ahead of
    // (and then overwritten by) the actual fetch.
    persist: { pick: ["experiment"] }
  }
);
