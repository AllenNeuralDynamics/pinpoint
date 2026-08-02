import { defineStore } from "pinia";
import type { Experiment } from "@/features/experiment";
import { ref } from "vue";

export const useRecentExperimentsStore = defineStore(
  "recent-experiments",
  () => {
    /**
     * Ordered list of recent experiments. Newest first.
     */
    const recents = ref<Experiment[]>([]);

    /**
     * Add the most recent experiment, replacing any existing entry with the
     * same id so re-opening an experiment doesn't list it twice.
     * @param experiment Experiment to add as the latest.
     */
    function add(experiment: Experiment) {
      remove(experiment);
      recents.value.unshift(experiment);
    }

    /**
     * Take an experiment out of the recents.
     * @param experiment Experiment to remove.
     */
    function remove(experiment: Experiment) {
      const experimentIndex = recents.value.findIndex(
        recent => recent.id === experiment.id
      );
      if (experimentIndex === -1) return;

      recents.value.splice(experimentIndex, 1);
    }

    const state = { recents };
    const actions = { add, remove };
    return { ...state, ...actions };
  },
  {
    persist: true
  }
);
