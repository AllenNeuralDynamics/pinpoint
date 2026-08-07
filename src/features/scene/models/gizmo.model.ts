import type {
  IPositionGizmo,
  IRotationGizmo,
  IScaleGizmo
} from "@babylonjs/core";

/** Which transform gizmo is exposed for the selected node. */
export type GizmoMode = "position" | "rotation" | "scale";

/** Axis frame the transform gizmos drag in. */
export type GizmoCoordinateSpace = "local" | "global";

/** A gizmo manager's three transform gizmos. */
export interface TransformGizmos {
  positionGizmo: IPositionGizmo;
  rotationGizmo: IRotationGizmo;
  scaleGizmo: IScaleGizmo;
}
