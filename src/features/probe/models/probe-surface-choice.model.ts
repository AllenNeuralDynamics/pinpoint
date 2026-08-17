/** A probe's pending pick between two surface-move paths. */
export interface ProbeSurfaceChoice {
  probeId: string;
  /**
   * Probe tip when the choice was requested, in the experiment's global
   * coordinate system, mm, relative to the atlas origin.
   */
  tipPosition: [number, number, number];
  /**
   * Probe rotation when the choice was requested, as a rest-relative rotation
   * triple about the global coordinate system's axes, in radians.
   */
  rotation: [number, number, number];
  /**
   * Tip target moving forward along the probe's depth axis, in the
   * experiment's global coordinate system, mm.
   */
  axisTargetMillimeters: [number, number, number];
  /**
   * Tip target moving along the inferior direction, in the experiment's
   * global coordinate system, mm.
   */
  inferiorTargetMillimeters: [number, number, number];
}
