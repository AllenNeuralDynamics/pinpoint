/** The ORCID account an experiment belongs to. */
export interface ExperimentAuthor {
  /** Author's ORCID iD, e.g. `0000-0001-2345-6789`. */
  orcid: string;

  /** Author's display name as reported by ORCID. */
  name: string;
}
