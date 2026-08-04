import type { GizmoManager } from "@babylonjs/core";
import { GizmoCoordinatesMode } from "@babylonjs/core";
import type {
  GizmoCoordinateSpace,
  GizmoMode,
  TransformGizmos
} from "../models/gizmo.model";

/**
 * Enable exactly one of a gizmo manager's transform gizmos in the given
 * coordinate space, returning both of them, or null if neither is enabled.
 * @param gizmoManager Gizmo manager to configure.
 * @param mode Transform gizmo to enable; the other is left built but detached.
 * @param coordinateSpace Axis frame both transform gizmos drag in.
 */
export function setGizmoControls(
  gizmoManager: GizmoManager,
  mode: GizmoMode,
  coordinateSpace: GizmoCoordinateSpace
): TransformGizmos | null {
  gizmoManager.positionGizmoEnabled = mode === "position";
  gizmoManager.rotationGizmoEnabled = mode === "rotation";

  // Also forces gizmo position tracking, so it follows the mesh in either space.
  gizmoManager.coordinatesMode =
    coordinateSpace === "local"
      ? GizmoCoordinatesMode.Local
      : GizmoCoordinatesMode.World;

  const { positionGizmo, rotationGizmo } = gizmoManager.gizmos;
  if (!positionGizmo || !rotationGizmo) return null;
  return { positionGizmo, rotationGizmo };
}
