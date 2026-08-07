import type { SceneModel } from "./scene-model.model";
import type { SceneObjectVisibility } from "./scene-object-visibility.model";

/** An arbitrary 3D model placed in the scene. */
export interface SceneObject extends SceneModel {
  inspectableKind: "sceneObject";

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
}
