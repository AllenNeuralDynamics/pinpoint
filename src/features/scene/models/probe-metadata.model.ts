export interface ProbeMetadata {
  probeInterfaceIdentifier: string;
  /** Shank alignment the meshes were built for; a change means they must be rebuilt. */
  shankAlignmentIndex: number | null;
}
