/**
 * An arbitrary 3D model's placement. Its `id` doubles as the key of the model's
 * file bytes in IndexedDB.
 */
export interface SceneModel {
  /** Internal unique identifier, and the IndexedDB key of the model's file. A UUID, not user facing. */
  id: string;

  /**
   * Internal position representation of the model's origin.
   * - Scene objects: AP, DV, ML order, ASR orientation, relative to the
   *   experiment reference coordinate, in mm.
   * - Probe body models: Babylon local X, Y, Z, relative to the probe's
   *   transform node, in mm.
   */
  position: [number, number, number];

  /**
   * Internal orientation representation of the model.
   * - Scene objects: roll, yaw, pitch order (aligned to AP, DV, ML order), in radians.
   * - Probe body models: Babylon local X, Y, Z rotation, relative to the
   *   probe's transform node, in radians.
   */
  rotation: [number, number, number];

  /**
   * Internal scale representation of the model.
   * - Scene objects: AP, DV, ML order, ASR orientation.
   * - Probe body models: Babylon local X, Y, Z.
   * - Unitless multiplier; 1 is the model's own size.
   */
  scale: [number, number, number];
}
