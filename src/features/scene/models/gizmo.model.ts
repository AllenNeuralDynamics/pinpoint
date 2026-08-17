import type { CoordinateGizmo } from "../api/coordinate-gizmo.api";

/** Which transform gizmo is exposed for the selected node. */
export type GizmoMode = "position" | "rotation" | "scale";

/** Which coordinate system the transform gizmos drag along. */
export type GizmoCoordinateSpace = "local" | "global";

/** The three transform gizmos, each drawn along a coordinate system's own axes. */
export interface CoordinateGizmos {
  positionGizmo: CoordinateGizmo;
  rotationGizmo: CoordinateGizmo;
  scaleGizmo: CoordinateGizmo;
}
