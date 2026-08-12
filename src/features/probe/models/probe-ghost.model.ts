/** A translucent probe clone drawn at the closest pose a coordinate system can reach. */
export interface ProbeGhost {
  /** Probe whose meshes the ghost clones. */
  probeId: string;
  /** Ghost tip, in atlas ASR mm as [ap, dv, ml]. */
  tipPosition: [number, number, number];
  /** Ghost rotation as [roll, yaw, pitch], in radians. */
  rotation: [number, number, number];
}
