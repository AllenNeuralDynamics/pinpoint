/** A sphere drawn where a coordinate system chain's on-surface node solves to. */
export interface ProbeSurfaceMarker {
  /** Probe whose color the marker takes. */
  probeId: string;
  /**
   * Marker center, in the experiment's global coordinate system, mm, relative
   * to the atlas origin.
   */
  position: [number, number, number];
}
