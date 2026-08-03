import type {
  ArcRotateCamera,
  GizmoManager,
  Observer,
  PointerInfo,
  Scene,
  SelectionOutlineLayer
} from "@babylonjs/core";
import { PointerEventTypes } from "@babylonjs/core";
import type { Inspectable } from "../models/inspectable.model";
import { pickAxisGuideDirection } from "./axis-guide.api";
import { orbitCameraTowards } from "./camera.api";
import { attachProbeSelection, getProbeTransformNode } from "../api/probe.api";

/**
 * Select the entity in the scene based on the selected inspectable.
 * @param selectedInspectable Inspectable to select in the scene.
 * @param scene Scene to select entities from.
 * @param gizmoManager Gizmo manager to update.
 * @param selectionOutlineLayer Selection outline layers to put the entity in.
 */
export function selectFromSelectedInspectableState(
  selectedInspectable: Inspectable | null,
  scene: Scene,
  gizmoManager: GizmoManager,
  selectionOutlineLayer: SelectionOutlineLayer
) {
  // Both branches result in clearing the selection outline layer at some point.
  selectionOutlineLayer.clearSelection();

  // Unattached gizmo if not selecting.
  if (!selectedInspectable) {
    gizmoManager.attachToNode(null);
    return;
  }

  switch (selectedInspectable.inspectableKind) {
    case "probe":
      const probeTransformNode = getProbeTransformNode(
        scene,
        selectedInspectable.id
      );
      if (!probeTransformNode) return;
      attachProbeSelection(
        gizmoManager,
        selectionOutlineLayer,
        probeTransformNode
      );
      break;
    default:
      break;
  }
}

/**
 * Clear a selection in the scene if clicked empty space or a structure mesh.
 *
 * @param scene Scene to clear the selection in.
 * @param gizmoManager Gizmo manager to update.
 * @param selectionOutlineLayer Selection outline to clear.
 * @param onDeselect Callback to let others know a deselect happened.
 */
export function deselectFromPointerDown(
  scene: Scene,
  gizmoManager: GizmoManager,
  selectionOutlineLayer: SelectionOutlineLayer,
  onDeselect: () => void
): Observer<PointerInfo> {
  return scene.onPointerObservable.add(pointerInfo => {
    const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
    if (pickedMesh && !pickedMesh.name.includes("structure")) return;

    gizmoManager.attachToNode(null);
    selectionOutlineLayer.clearSelection();
    onDeselect();
  }, PointerEventTypes.POINTERTAP);
}

/**
 * Orbit the camera onto an axis guide's axis when its label is double-clicked.
 * @param scene Scene to observe pointer events on.
 * @param camera Camera to orbit.
 */
export function orbitCameraFromAxisGuideDoubleTap(
  scene: Scene,
  camera: ArcRotateCamera
): Observer<PointerInfo> {
  return scene.onPointerObservable.add(() => {
    const direction = pickAxisGuideDirection(
      scene,
      scene.pointerX,
      scene.pointerY
    );
    if (!direction) return;

    orbitCameraTowards(camera, direction);
  }, PointerEventTypes.POINTERDOUBLETAP);
}
