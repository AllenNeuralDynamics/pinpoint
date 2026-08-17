/**
 * An arbitrary 3D model's placement.
 */
export interface SceneModel {
  /**
   * IndexedDB key of the model's file bytes. A UUID, not user facing. Two scene
   * entities may share one `modelId` and so one stored file.
   */
  modelId: string;

  /**
   * Internal position representation of the model's origin.
   * - Scene objects: the experiment's global coordinate system, relative to
   *   the atlas origin, in mm.
   * - Probe body models: Babylon local X, Y, Z, relative to the probe's
   *   transform node, in mm.
   */
  position: [number, number, number];

  /**
   * Internal orientation representation of the model.
   * - Scene objects: a rotation triple about the global coordinate system's
   *   own axes, in radians.
   * - Probe body models: Babylon local X, Y, Z rotation, relative to the
   *   probe's transform node, in radians.
   */
  rotation: [number, number, number];

  /**
   * Internal scale representation of the model.
   * - Scene objects: one factor per global coordinate system axis, which the
   *   object node's scale node takes through `toSceneMagnitudes`.
   * - Probe body models: Babylon local X, Y, Z.
   * - Unitless multiplier; 1 is the model's own size.
   */
  scale: [number, number, number];
}
