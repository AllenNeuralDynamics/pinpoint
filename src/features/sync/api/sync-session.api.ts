import type { Experiment, ExperimentAuthor } from "@/features/experiment";
import {
  claimExperiment,
  isAuthoredBy,
  planPull,
  type SyncListing
} from "./sync.api";

/** I/O the pull step needs, injected so the step itself stays testable. */
export interface PullDependencies {
  fetchArchive: (experimentId: string) => Promise<Uint8Array>;
  restoreArchive: (
    archiveBytes: Uint8Array
  ) => Promise<{ experiment: Experiment } | null>;
}

/** Outcome of a pull: what came down, and which blobs could not be taken. */
export interface PullResult {
  experiments: Experiment[];
  failedIds: string[];
}

/**
 * Claim every unclaimed experiment for the signed-in author and turn sync off
 * for the experiments another author left on this computer.
 * @param experiments Every experiment held on this computer.
 * @param author Signed-in ORCID account.
 * @param setSyncEnabled Callback recording an experiment's sync choice.
 */
export function reconcileAuthorship(
  experiments: Experiment[],
  author: ExperimentAuthor,
  setSyncEnabled: (experimentId: string, isEnabled: boolean) => void
) {
  for (const experiment of experiments) {
    claimExperiment(experiment, author);
    if (!isAuthoredBy(experiment, author.orcid)) {
      setSyncEnabled(experiment.id, false);
    }
  }
}

/**
 * Download the server's experiments that this computer is missing or holds an
 * older copy of, in listing order, reporting the ids that could not be taken.
 * @param listings Blob metadata the server reports for the account.
 * @param localExperiments Experiments already held on this computer.
 * @param dependencies Archive fetch and restore implementations.
 */
export async function pullSyncedExperiments(
  listings: SyncListing[],
  localExperiments: Experiment[],
  dependencies: PullDependencies
): Promise<PullResult> {
  const experiments: Experiment[] = [];
  const failedIds: string[] = [];

  for (const experimentId of planPull(listings, localExperiments)) {
    try {
      const archiveBytes = await dependencies.fetchArchive(experimentId);
      const restored = await dependencies.restoreArchive(archiveBytes);
      // A blob whose payload doesn't match its own name would overwrite an
      // unrelated experiment, so it is dropped rather than trusted.
      if (!restored || restored.experiment.id !== experimentId) {
        failedIds.push(experimentId);
        continue;
      }
      experiments.push(restored.experiment);
    } catch {
      failedIds.push(experimentId);
    }
  }

  return { experiments, failedIds };
}
