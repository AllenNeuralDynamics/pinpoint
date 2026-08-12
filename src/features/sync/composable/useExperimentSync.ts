import { computed } from "vue";
import type { Pinia } from "pinia";
import { useDebounceFn, watchIgnorable } from "@vueuse/core";
import type { Experiment } from "@/features/experiment";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";
import { useSyncStore } from "@/stores/sync.store";
import {
  buildExperimentArchive,
  restoreExperimentArchive
} from "../api/experiment-archive.api";
import {
  fetchSyncedArchive,
  fetchSyncUser,
  listSyncedArchives,
  postSyncLogout,
  pushSyncedArchive
} from "../api/sync-client.api";
import { buildLoginUrl, isAuthoredBy, touchExperiment } from "../api/sync.api";
import {
  pullSyncedExperiments,
  reconcileAuthorship
} from "../api/sync-session.api";

/** Quiet period after the last edit before the experiment is pushed, in ms. */
const PUSH_DEBOUNCE_MS = 3000;

/**
 * Mirror the signed-in account's experiments onto the sync server, and drive
 * the sign-in / sign-out flow.
 * @param pinia Pinia instance to resolve stores from, for use outside components.
 */
export function useExperimentSync(pinia?: Pinia) {
  const syncStore = useSyncStore(pinia);
  const currentExperimentStore = useCurrentExperimentStore(pinia);
  const recentExperimentsStore = useRecentExperimentsStore(pinia);

  /** Every experiment held on this computer, current one first. */
  const localExperiments = computed<Experiment[]>(() => [
    currentExperimentStore.experiment,
    ...recentExperimentsStore.recents
  ]);

  /**
   * Should this experiment be mirrored: the account is signed in, owns it, and
   * has not turned its sync off.
   * @param experiment Experiment to check.
   */
  function isSynced(experiment: Experiment): boolean {
    const user = syncStore.user;
    return (
      user !== null &&
      isAuthoredBy(experiment, user.orcid) &&
      syncStore.isSyncEnabled(experiment.id)
    );
  }

  /**
   * Push one experiment to the server, if it is meant to sync.
   * @param experiment Experiment to push.
   */
  async function pushExperiment(experiment: Experiment) {
    if (!isSynced(experiment)) return;

    await pushSyncedArchive(
      experiment.id,
      await buildExperimentArchive(experiment)
    );
  }

  /** Push every experiment on this computer that is meant to sync. */
  async function pushAllExperiments() {
    for (const experiment of localExperiments.value) {
      await pushExperiment(experiment);
    }
  }

  /** Leave Pinpoint for ORCID, returning to this exact URL once signed in. */
  function signIn() {
    window.location.assign(buildLoginUrl(window.location.href));
  }

  /** Sign out on the server and locally, leaving local experiments in place. */
  async function signOut() {
    await postSyncLogout();
    syncStore.signOut();
  }

  /**
   * Adopt the live server session, if any: claim unauthored experiments, turn
   * sync off for another author's, pull down what this computer is missing, and
   * mirror everything back up.
   */
  async function restoreSession() {
    const user = await fetchSyncUser();
    if (!user) {
      syncStore.signOut();
      return;
    }

    syncStore.signIn(user);
    reconcileAuthorship(localExperiments.value, user, syncStore.setSyncEnabled);

    // A blob whose experiment was deleted locally has its sync turned off, so
    // filtering here keeps a delete from being undone by the next pull.
    const listings = (await listSyncedArchives()).filter(({ name }) =>
      syncStore.isSyncEnabled(name)
    );
    const pulled = await pullSyncedExperiments(
      listings,
      localExperiments.value,
      {
        fetchArchive: fetchSyncedArchive,
        restoreArchive: restoreExperimentArchive
      }
    );
    for (const experiment of pulled) recentExperimentsStore.add(experiment);

    await pushAllExperiments();
  }

  /**
   * Stamp the current experiment on every edit and push it once editing stops.
   * @remarks Call once per app; the watcher lives for the app's lifetime.
   */
  function watchCurrentExperiment() {
    const pushSoon = useDebounceFn(
      () => pushExperiment(currentExperimentStore.experiment),
      PUSH_DEBOUNCE_MS
    );

    // Stamped synchronously so an edit and its timestamp land in one undo point,
    // rather than the stamp becoming an undo point of its own.
    const { ignoreUpdates } = watchIgnorable(
      () => currentExperimentStore.experiment,
      () => {
        ignoreUpdates(() => touchExperiment(currentExperimentStore.experiment));
        void pushSoon();
      },
      { deep: true, flush: "sync" }
    );
  }

  return {
    signIn,
    signOut,
    restoreSession,
    pushExperiment,
    watchCurrentExperiment
  };
}
