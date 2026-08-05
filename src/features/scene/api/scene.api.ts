import { Color3, HemisphericLight, PointerEventTypes } from "@babylonjs/core";
import type {
  ArcRotateCamera,
  GizmoManager,
  Observer,
  PointerInfo,
  Scene,
  SelectionOutlineLayer
} from "@babylonjs/core";
import type { Inspectable } from "../models/inspectable.model";
import { pickAxisGuideDirection } from "./axis-guide.api";
import { orbitCameraTowards } from "./camera.api";
import { attachProbeSelection, getProbeTransformNode } from "./probe.api";
import { isStructureMeshName } from "./structures.api";

/**
 * Select the entity in the scene based on the selected inspectable.
 * @param scene Scene to select entities from.
 * @param gizmoManager Gizmo manager to update.
 * @param selectionOutlineLayer Selection outline layers to put the entity in.
 * @param selectedInspectable Inspectable to select in the scene.
 */
export function selectFromSelectedInspectableState(
  scene: Scene,
  gizmoManager: GizmoManager,
  selectionOutlineLayer: SelectionOutlineLayer,
  selectedInspectable: Inspectable | null
) {
  // Both branches result in clearing the selection outline layer at some point.
  selectionOutlineLayer.clearSelection();

  // Unattached gizmo if not selecting.
  if (!selectedInspectable) {
    gizmoManager.attachToNode(null);
    return;
  }

  const probeTransformNode = getProbeTransformNode(
    scene,
    selectedInspectable.id
  );
  if (!probeTransformNode) return;
  attachProbeSelection(
    gizmoManager,
    selectionOutlineLayer,
    selectedInspectable,
    probeTransformNode
  );
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
    if (pickedMesh && !isStructureMeshName(pickedMesh.name)) return;

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

/**
 * Set the scene's background clear color from a `#rrggbb` string.
 * @param scene Scene to set the background of.
 * @param hexColor Background color as `#rrggbb`.
 */
export function setSceneBackgroundColor(scene: Scene, hexColor: string): void {
  scene.clearColor = Color3.FromHexString(hexColor).toColor4(1);
}

/**
 * Set the intensity of every hemispheric light in the scene.
 * @param scene Scene whose lights to set.
 * @param intensity Light intensity to apply.
 */
export function setHemisphericLightIntensity(
  scene: Scene,
  intensity: number
): void {
  for (const light of scene.lights) {
    if (light instanceof HemisphericLight) light.intensity = intensity;
  }
}
