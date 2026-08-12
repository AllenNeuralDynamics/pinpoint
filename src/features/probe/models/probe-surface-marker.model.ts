/** A sphere drawn where a coordinate system chain's on-surface node solves to. */
export interface ProbeSurfaceMarker {
  /** Probe whose color the marker takes. */
  probeId: string;
  /** Marker center, in atlas ASR mm as [ap, dv, ml]. */
  position: [number, number, number];
}
