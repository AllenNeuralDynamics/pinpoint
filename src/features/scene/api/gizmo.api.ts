import type { GizmoManager } from "@babylonjs/core";
import { GizmoCoordinatesMode } from "@babylonjs/core";
import type {
  GizmoCoordinateSpace,
  GizmoMode,
  TransformGizmos
} from "../models/gizmo.model";

/**
 * Enable exactly one of a gizmo manager's transform gizmos in the given
 * coordinate space, returning both of them. The manager must have been built
 * with both transform gizmos enabled once, as `createBabylonRuntimeService`
 * does.
 * @param gizmoManager Gizmo manager to configure.
 * @param mode Transform gizmo to enable; the other is left built but detached.
 * @param coordinateSpace Axis frame both transform gizmos drag in.
 */
export function setGizmoControls(
  gizmoManager: GizmoManager,
  mode: GizmoMode,
  coordinateSpace: GizmoCoordinateSpace
): TransformGizmos {
  gizmoManager.positionGizmoEnabled = mode === "position";
  gizmoManager.rotationGizmoEnabled = mode === "rotation";

  // Sets `updateGizmoRotationToMatchAttachedMesh` from the space and forces
  // `updateGizmoPositionToMatchAttachedMesh` true, so the gizmo keeps tracking
  // the mesh in either space instead of parking at the origin.
  gizmoManager.coordinatesMode =
    coordinateSpace === "local"
      ? GizmoCoordinatesMode.Local
      : GizmoCoordinatesMode.World;

  return {
    positionGizmo: gizmoManager.gizmos.positionGizmo!,
    rotationGizmo: gizmoManager.gizmos.rotationGizmo!
  };
}
