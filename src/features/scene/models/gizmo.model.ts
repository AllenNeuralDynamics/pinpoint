import type { IPositionGizmo, IRotationGizmo } from "@babylonjs/core";

/** Which transform gizmo is exposed for the selected node. */
export type GizmoMode = "position" | "rotation";

/** Axis frame the transform gizmos drag in. */
export type GizmoCoordinateSpace = "local" | "global";

/** A gizmo manager's two transform gizmos. */
export interface TransformGizmos {
  positionGizmo: IPositionGizmo;
  rotationGizmo: IRotationGizmo;
}
