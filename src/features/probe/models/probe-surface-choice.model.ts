/** A probe's pending pick between two surface-move paths. */
export interface ProbeSurfaceChoice {
  probeId: string;
  /** Probe tip when the choice was requested, in atlas ASR mm. */
  tipPosition: [number, number, number];
  /** Probe rotation when the choice was requested, in radians. */
  rotation: [number, number, number];
  /** Tip target moving forward along probe-local -Z, in atlas ASR mm. */
  axisTargetMillimeters: [number, number, number];
  /** Tip target moving down on DV (global -Y), in atlas ASR mm. */
  dorsoventralTargetMillimeters: [number, number, number];
}
