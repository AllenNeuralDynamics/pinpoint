import type { ProbeGeometry } from "./probe-geometry.model";

export interface ProbeMetadata {
  probeInterfaceIdentifier: string;
  /** Shank alignment the meshes were built for; a change means they must be rebuilt. */
  shankAlignmentIndex: number | null;
  /** Body geometry the meshes were built for; a change means they must be rebuilt. */
  geometry: ProbeGeometry;
  /**
   * Body model the meshes were built for; a change means they must be rebuilt,
   * since a body model replaces the head stage and rod.
   */
  bodyModelId: string | null;
}
