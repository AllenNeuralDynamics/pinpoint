import type { Experiment, ExperimentAuthor } from "@/features/experiment";

/** Metadata of one experiment blob held on the sync server. */
export interface SyncListing {
  /** Blob name, which is the experiment's id. */
  name: string;
  /** ISO-8601 timestamp of when the blob was last pushed. */
  timestamp: string;
  /** MIME type the blob was stored under. */
  content_type: string;
}

/**
 * Path the metadata-viz service is mounted at on the app's own origin: Apache
 * in production and the dev server's proxy both forward it to the service, so
 * the ORCID session cookie rides along without any cross-origin request.
 */
export const SYNC_SERVICE_PATH = "/metadata-viz";

/** Content type experiment archives are pushed and served under. */
export const SYNC_ARCHIVE_CONTENT_TYPE = "application/zip";

/**
 * Build the ORCID login URL that returns the browser to `returnUrl` afterwards.
 * @param returnUrl Absolute URL to come back to once logged in.
 */
export function buildLoginUrl(returnUrl: string): string {
  return `${SYNC_SERVICE_PATH}/auth/orcid/login?next=${encodeURIComponent(returnUrl)}`;
}

/**
 * Stamp an experiment as edited now, so a later sync can resolve it by recency.
 * @param experiment Experiment to stamp.
 */
export function touchExperiment(experiment: Experiment) {
  experiment.updatedAt = new Date().toISOString();
}

/**
 * Attach an author to an experiment that has none, leaving an already-authored
 * experiment untouched.
 * @param experiment Experiment to claim.
 * @param author Author to attach.
 */
export function claimExperiment(
  experiment: Experiment,
  author: ExperimentAuthor
) {
  if (experiment.author === null) experiment.author = author;
}

/**
 * Is the experiment authored by the given ORCID iD.
 * @param experiment Experiment to check.
 * @param orcid ORCID iD to check against.
 */
export function isAuthoredBy(experiment: Experiment, orcid: string): boolean {
  return experiment.author?.orcid === orcid;
}

/**
 * Split experiments into those authored by `orcid` and those authored by
 * somebody else who used this computer.
 * @param experiments Experiments to split.
 * @param orcid ORCID iD of the logged-in author.
 */
export function partitionExperimentsByAuthor(
  experiments: Experiment[],
  orcid: string
): { own: Experiment[]; foreign: Experiment[] } {
  const own: Experiment[] = [];
  const foreign: Experiment[] = [];
  for (const experiment of experiments) {
    if (isAuthoredBy(experiment, orcid)) own.push(experiment);
    else foreign.push(experiment);
  }
  return { own, foreign };
}

/**
 * Names of the server's experiment archives worth downloading: those with no
 * local copy, and those the server holds a strictly newer copy of.
 * @param listings Blob metadata the server reports for the account.
 * @param localExperiments Experiments already held on this computer.
 */
export function planPull(
  listings: SyncListing[],
  localExperiments: Experiment[]
): string[] {
  const localUpdatedAt = new Map(
    localExperiments.map(({ id, updatedAt }) => [id, Date.parse(updatedAt)])
  );

  return listings
    .filter(({ content_type }) => content_type === SYNC_ARCHIVE_CONTENT_TYPE)
    .filter(({ name, timestamp }) => {
      const local = localUpdatedAt.get(name);
      if (local === undefined || !Number.isFinite(local)) return true;
      const remote = Date.parse(timestamp);
      return Number.isFinite(remote) && remote > local;
    })
    .map(({ name }) => name);
}
