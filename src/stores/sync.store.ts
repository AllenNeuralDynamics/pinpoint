import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { ExperimentAuthor } from "@/features/experiment";

export const useSyncStore = defineStore(
  "sync",
  () => {
    /** Logged-in ORCID account, or null when sync is off. */
    const user = ref<ExperimentAuthor | null>(null);

    /**
     * Ids of experiments the user has turned sync off for. Experiments sync by
     * default, so only the exceptions are tracked.
     */
    const disabledExperimentIds = ref<string[]>([]);

    /** Is an ORCID account signed in. */
    const isSignedIn = computed(() => user.value !== null);

    /**
     * Does this experiment id sync.
     * @param experimentId Id of the experiment to check.
     */
    function isSyncEnabled(experimentId: string): boolean {
      return !disabledExperimentIds.value.includes(experimentId);
    }

    /**
     * Turn sync on or off for an experiment id.
     * @param experimentId Id of the experiment to set sync for.
     * @param isEnabled Whether the experiment should sync.
     */
    function setSyncEnabled(experimentId: string, isEnabled: boolean) {
      const index = disabledExperimentIds.value.indexOf(experimentId);
      if (isEnabled) {
        if (index !== -1) disabledExperimentIds.value.splice(index, 1);
        return;
      }
      if (index === -1) disabledExperimentIds.value.push(experimentId);
    }

    /**
     * Record the signed-in account.
     * @param author Signed-in ORCID account.
     */
    function signIn(author: ExperimentAuthor) {
      user.value = author;
    }

    /** Forget the signed-in account, leaving per-experiment sync choices alone. */
    function signOut() {
      user.value = null;
    }

    const state = { user, disabledExperimentIds };
    const getters = { isSignedIn };
    const actions = { isSyncEnabled, setSyncEnabled, signIn, signOut };
    return { ...state, ...getters, ...actions };
  },
  {
    persist: true
  }
);
