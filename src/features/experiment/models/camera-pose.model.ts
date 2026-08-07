/**
 * Orbit and target of the scene camera. Doubles as the camera's inspectable:
 * the scene has exactly one camera, so `isSameInspectable` matches any two.
 */
export interface CameraPose {
  inspectableKind: "camera";

  /** Internal unique identifier. A UUID, not user facing. */
  id: string;

  /**
   * User-facing label. Need not be unique. Empty for an experiment's live
   * pose, which is never listed.
   */
  name: string;

  /** Orbit azimuth, in radians. */
  alpha: number;

  /** Orbit elevation, in radians. */
  beta: number;

  /** Distance from the camera target, in mm. */
  radius: number;

  /**
   * Point the camera orbits.
   * - AP, DV, ML order.
   * - ASR orientation.
   * - Relative to the experiment's reference coordinate.
   * - In mm.
   */
  target: [number, number, number];
}
