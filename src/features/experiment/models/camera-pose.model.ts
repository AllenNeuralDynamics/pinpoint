/** Saved orbit pose of the scene camera. */
export interface CameraPose {
  /** Internal unique identifier. A UUID, not user facing. */
  id: string;

  /** User-facing label. Need not be unique. */
  name: string;

  /** Orbit azimuth, in radians. */
  alpha: number;

  /** Orbit elevation, in radians. */
  beta: number;

  /** Distance from the camera target, in mm. */
  radius: number;
}
