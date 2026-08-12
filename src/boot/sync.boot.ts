import { defineBoot } from "#q-app";
import { useExperimentSync } from "@/features/sync";

/**
 * Start mirroring experiments to the sync server and adopt any live ORCID
 * session left by a login redirect.
 */
export default defineBoot(({ store }) => {
  const { restoreSession, watchCurrentExperiment } = useExperimentSync(store);

  watchCurrentExperiment();
  void restoreSession();
});
