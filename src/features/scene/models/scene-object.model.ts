import type { SceneObjectVisibility } from "./scene-object-visibility.model";

/**
 * An arbitrary 3D model placed in the scene. Its `id` doubles as the key of the
 * object's GLB bytes in IndexedDB.
 */
export interface SceneObject {
  inspectableKind: "sceneObject";

  /** Internal unique identifier. A UUID, not user facing. */
  id: string;

  /** User-facing label. Need not be unique. */
  name: string;

  /** Diffuse color of the object's material, as `#RRGGBB`. */
  color: string;

  visibility: SceneObjectVisibility;

  /**
   * Is the object locked against pose edits. Locked objects get no transform
   * gizmo and their position/rotation inputs are disabled.
   */
  lock: boolean;

  /** Does the object's body participate in collision detection with probes and other objects. */
  collidable: boolean;

  /**
   * Internal position representation of the object's origin.
   * - AP, DV, ML order.
   * - ASR orientation.
   * - Relative to the experiment reference coordinate.
   * - In mm.
   */
  position: [number, number, number];

  /**
   * Internal orientation representation of the object.
   * - Roll, yaw, pitch order (aligned to AP, DV, ML order).
   * - In radians.
   */
  rotation: [number, number, number];

  /**
   * Internal scale representation of the object.
   * - AP, DV, ML order.
   * - ASR orientation.
   * - Unitless multiplier; 1 is the model's own size.
   */
  scale: [number, number, number];
}
