/** A translucent probe clone drawn at the closest pose a coordinate system can reach. */
export interface ProbeGhost {
  /** Probe whose meshes the ghost clones. */
  probeId: string;
  /**
   * Ghost tip, in the experiment's global coordinate system, mm, relative to
   * the atlas origin.
   */
  tipPosition: [number, number, number];
  /**
   * Ghost orientation, as a rest-relative rotation triple about the
   * experiment's global coordinate system's axes, in radians, pivoting on the
   * tip. At all zeros the ghost sits in the experiment's local coordinate
   * system's rest orientation.
   */
  rotation: [number, number, number];
}
