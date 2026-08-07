import { Color3, HemisphericLight, PointerEventTypes } from "@babylonjs/core";
import type {
  ArcRotateCamera,
  GizmoManager,
  Observer,
  PointerInfo,
  Scene,
  SelectionOutlineLayer,
  Vector3
} from "@babylonjs/core";
import type { Inspectable } from "../models/inspectable.model";
import { pickAxisGuideDirection } from "./axis-guide.api";
import { orbitCameraTowards } from "./camera.api";
import { attachProbeSelection, getProbeTransformNode } from "./probe.api";
import { getProbeGizmoNode } from "./probe-body-model.api";
import {
  attachSceneObjectSelection,
  getSceneObjectTransformNode
} from "./scene-object-node.api";

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
  selectedInspectable: Inspectable | null,
  bodyModelGizmoProbeId: string | null
) {
  // Both branches result in clearing the selection outline layer at some point.
  selectionOutlineLayer.clearSelection();

  switch (selectedInspectable?.inspectableKind) {
    case undefined:
    case "camera":
      gizmoManager.attachToNode(null);
      return;
    case "probe": {
      const probeTransformNode = getProbeTransformNode(
        scene,
        selectedInspectable.id
      );
      if (!probeTransformNode) return;
      attachProbeSelection(
        gizmoManager,
        selectionOutlineLayer,
        selectedInspectable,
        probeTransformNode,
        getProbeGizmoNode(
          scene,
          selectedInspectable,
          probeTransformNode,
          bodyModelGizmoProbeId
        )
      );
      return;
    }
    case "sceneObject": {
      const sceneObjectTransformNode = getSceneObjectTransformNode(
        scene,
        selectedInspectable.id
      );
      if (!sceneObjectTransformNode) return;
      attachSceneObjectSelection(
        gizmoManager,
        selectionOutlineLayer,
        selectedInspectable,
        sceneObjectTransformNode
      );
    }
  }
}

/**
 * Clear a selection in the scene when a tap doesn't hit a selectable mesh.
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
    if (pointerInfo.pickInfo?.pickedMesh) return;

    gizmoManager.attachToNode(null);
    selectionOutlineLayer.clearSelection();
    onDeselect();
  }, PointerEventTypes.POINTERTAP);
}

/**
 * Orbit the camera onto an axis guide's axis when its label is double-clicked.
 * @param scene Scene to observe pointer events on.
 * @param camera Camera to orbit.
 * @param onOrbit Called with the world direction the camera was sent towards.
 */
export function orbitCameraFromAxisGuideDoubleTap(
  scene: Scene,
  camera: ArcRotateCamera,
  onOrbit: (direction: Vector3) => void
): Observer<PointerInfo> {
  return scene.onPointerObservable.add(() => {
    const direction = pickAxisGuideDirection(
      scene,
      scene.pointerX,
      scene.pointerY
    );
    if (!direction) return;

    orbitCameraTowards(camera, direction);
    onOrbit(direction);
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
