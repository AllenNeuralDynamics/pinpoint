import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PickingInfo } from "@babylonjs/core";
import { MeshBuilder, PointerEventTypes, PointerInfo } from "@babylonjs/core";
import {
  addProbe,
  buildExperiment,
  internProbeInterfaceProbe
} from "@/features/experiment";
import { getProbeInterfaceIdentifier } from "@/features/probe";
import { makeAtlas, makeProbe, makeProbeInterfaceProbe } from "@/test/fixtures";
import {
  initializeTestCSG2,
  makeTestSceneWithGizmo
} from "@/test/mount-helper";
import { buildProbe } from "./probe.api";
import {
  deselectFromPointerDown,
  selectFromSelectedInspectableState
} from "./scene.api";

// buildProbe's head stage is CSG2-subtracted.
beforeAll(async () => {
  await initializeTestCSG2();
});

/** Single-shank contour (imec NP1000), in micrometers. */
const NP1000_CONTOUR = [
  [-11, 9989],
  [-11, -11],
  [24, -220],
  [59, -11],
  [59, 9989]
];

function makeProbeInScene() {
  const { scene, gizmoManager, selectionOutlineLayer } =
    makeTestSceneWithGizmo();
  const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
  const probeInterfaceProbe = makeProbeInterfaceProbe({
    probe_planar_contour: NP1000_CONTOUR
  });
  internProbeInterfaceProbe(experiment, probeInterfaceProbe);
  const probe = makeProbe({
    probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe)
  });
  addProbe(experiment, probe);
  const node = buildProbe(scene, probe, experiment, gizmoManager)!;

  return {
    scene,
    gizmoManager,
    selectionOutlineLayer,
    experiment,
    probe,
    node
  };
}

describe("selectFromSelectedInspectableState", () => {
  it("detaches the gizmo and clears the outline when nothing is selected", () => {
    const { scene, gizmoManager, selectionOutlineLayer, node } =
      makeProbeInScene();
    gizmoManager.attachToNode(node);
    selectionOutlineLayer.addSelection(node.getChildMeshes());

    selectFromSelectedInspectableState(
      null,
      scene,
      gizmoManager,
      selectionOutlineLayer
    );

    expect(gizmoManager.attachedNode).toBeNull();
    for (const mesh of node.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(false);
    }
  });

  it("attaches the gizmo and outlines a selected probe's meshes", () => {
    const { scene, gizmoManager, selectionOutlineLayer, probe, node } =
      makeProbeInScene();

    selectFromSelectedInspectableState(
      probe,
      scene,
      gizmoManager,
      selectionOutlineLayer
    );

    expect(gizmoManager.attachedNode).toBe(node);
    for (const mesh of node.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(true);
    }
  });

  it("clears the outline layer even when the selected probe has no transform node", () => {
    const { scene, gizmoManager, selectionOutlineLayer, node } =
      makeProbeInScene();
    selectionOutlineLayer.addSelection(node.getChildMeshes());
    const missingProbe = makeProbe({ id: "missing" });

    selectFromSelectedInspectableState(
      missingProbe,
      scene,
      gizmoManager,
      selectionOutlineLayer
    );

    for (const mesh of node.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(false);
    }
  });

  it("replaces a prior selection when a different probe is selected", () => {
    const a = makeProbeInScene();
    const { scene, gizmoManager, selectionOutlineLayer } = a;
    const experiment = a.experiment;
    const probeInterfaceProbe = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np2020" },
      probe_planar_contour: NP1000_CONTOUR
    });
    internProbeInterfaceProbe(experiment, probeInterfaceProbe);
    const probeB = makeProbe({
      probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe)
    });
    addProbe(experiment, probeB);
    const nodeB = buildProbe(scene, probeB, experiment, gizmoManager)!;

    selectFromSelectedInspectableState(
      a.probe,
      scene,
      gizmoManager,
      selectionOutlineLayer
    );
    selectFromSelectedInspectableState(
      probeB,
      scene,
      gizmoManager,
      selectionOutlineLayer
    );

    expect(gizmoManager.attachedNode).toBe(nodeB);
    for (const mesh of a.node.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(false);
    }
    for (const mesh of nodeB.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(true);
    }
  });
});

describe("deselectFromPointerDown", () => {
  function tap(
    scene: ReturnType<typeof makeTestSceneWithGizmo>["scene"],
    pickedMesh: PickingInfo["pickedMesh"] | null = null
  ) {
    const pointerInfo = new PointerInfo(
      PointerEventTypes.POINTERTAP,
      {} as PointerEvent,
      { pickedMesh } as PickingInfo
    );
    scene.onPointerObservable.notifyObservers(
      pointerInfo,
      PointerEventTypes.POINTERTAP
    );
  }

  it("deselects when tapping empty space", () => {
    const { scene, gizmoManager, selectionOutlineLayer, node } =
      makeProbeInScene();
    gizmoManager.attachToNode(node);
    selectionOutlineLayer.addSelection(node.getChildMeshes());
    const onDeselect = vi.fn();

    deselectFromPointerDown(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      onDeselect
    );
    tap(scene, null);

    expect(gizmoManager.attachedNode).toBeNull();
    for (const mesh of node.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(false);
    }
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it("deselects when tapping a structure mesh", () => {
    const { scene, gizmoManager, selectionOutlineLayer, node } =
      makeProbeInScene();
    gizmoManager.attachToNode(node);
    const structureMesh = MeshBuilder.CreateBox("1_structure_mesh", {}, scene);
    const onDeselect = vi.fn();

    deselectFromPointerDown(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      onDeselect
    );
    tap(scene, structureMesh);

    expect(gizmoManager.attachedNode).toBeNull();
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it("does nothing when tapping a probe mesh", () => {
    const { scene, gizmoManager, selectionOutlineLayer, node } =
      makeProbeInScene();
    gizmoManager.attachToNode(node);
    const onDeselect = vi.fn();

    deselectFromPointerDown(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      onDeselect
    );
    tap(scene, node.getChildMeshes()[0]!);

    expect(gizmoManager.attachedNode).toBe(node);
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it("does nothing for pointer events other than tap", () => {
    const { scene, gizmoManager, selectionOutlineLayer, node } =
      makeProbeInScene();
    gizmoManager.attachToNode(node);
    const onDeselect = vi.fn();

    deselectFromPointerDown(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      onDeselect
    );
    const pointerInfo = new PointerInfo(
      PointerEventTypes.POINTERDOWN,
      {} as PointerEvent,
      { pickedMesh: null } as PickingInfo
    );
    scene.onPointerObservable.notifyObservers(
      pointerInfo,
      PointerEventTypes.POINTERDOWN
    );

    expect(gizmoManager.attachedNode).toBe(node);
    expect(onDeselect).not.toHaveBeenCalled();
  });
});
