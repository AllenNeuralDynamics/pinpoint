import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PickingInfo, Scene } from "@babylonjs/core";
import {
  ArcRotateCamera,
  Matrix,
  MeshBuilder,
  PointerEventTypes,
  PointerInfo,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import {
  addProbe,
  buildExperiment,
  internProbeInterfaceProbe
} from "@/features/experiment";
import { getProbeInterfaceIdentifier } from "@/features/probe";
import {
  makeAtlas,
  makeCameraPose,
  makeCoordinateSystem,
  makeProbe,
  makeProbeGeometry,
  makeProbeInterfaceProbe,
  makeSceneModel,
  makeSceneObject
} from "@/test/fixtures";
import type { FakeTextRenderer } from "@/test/mount-helper";
import {
  initializeTestCSG2,
  makeFakeTextRenderer,
  makeTestFontAsset,
  makeTestScene,
  makeTestSceneWithGizmo
} from "@/test/mount-helper";
import { buildProbe } from "./probe.api";
import type {
  AxisGuideAxis,
  AxisGuideLabels,
  AxisGuides
} from "./axis-guide.api";
import { buildAxisGuides } from "./axis-guide.api";
import { buildSceneEntityName } from "./scene-entity.api";
import { WORLD_INSPECTABLE } from "../models/inspectable.model";
import {
  deselectFromPointerDown,
  getSelectedInspectableGizmoNode,
  orbitCameraFromAxisGuideDoubleTap,
  selectFromSelectedInspectableState,
  setSceneEntitiesHidden
} from "./scene.api";
import { buildAtlasRootNode } from "./structures.api";

/** Built-in axis guide labels, matching `+AP`/`-AP` etc. */
const AXIS_LABELS: AxisGuideLabels = {
  ap: "AP",
  dv: "DV",
  ml: "ML",
  x: "X",
  y: "Y",
  z: "Z"
};

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
  const node = buildProbe(
    scene,
    probe,
    experiment,
    gizmoManager,
    makeProbeGeometry()
  )!;

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
      scene,
      gizmoManager,
      selectionOutlineLayer,
      null,
      null
    );

    expect(gizmoManager.attachedNode).toBeNull();
    for (const mesh of node.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(false);
    }
  });

  it("detaches the gizmo and clears the outline when the camera is selected", () => {
    const { scene, gizmoManager, selectionOutlineLayer, node } =
      makeProbeInScene();
    gizmoManager.attachToNode(node);
    selectionOutlineLayer.addSelection(node.getChildMeshes());

    selectFromSelectedInspectableState(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      makeCameraPose(),
      null
    );

    expect(gizmoManager.attachedNode).toBeNull();
    for (const mesh of node.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(false);
    }
  });

  it("detaches the gizmo and clears the outline when a coordinate system is selected", () => {
    const { scene, gizmoManager, selectionOutlineLayer, node } =
      makeProbeInScene();
    gizmoManager.attachToNode(node);
    selectionOutlineLayer.addSelection(node.getChildMeshes());

    selectFromSelectedInspectableState(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      makeCoordinateSystem(),
      null
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
      scene,
      gizmoManager,
      selectionOutlineLayer,
      probe,
      null
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
      scene,
      gizmoManager,
      selectionOutlineLayer,
      missingProbe,
      null
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
    const nodeB = buildProbe(
      scene,
      probeB,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;

    selectFromSelectedInspectableState(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      a.probe,
      null
    );
    selectFromSelectedInspectableState(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      probeB,
      null
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

/**
 * Build a real `AxisGuides` object backed by fake renderers and a fixture
 * font asset, for one test's scene.
 * @param scene Scene the font asset's texture is hosted in.
 */
function makeTestAxisGuides(scene: Scene): AxisGuides {
  const renderers: Record<AxisGuideAxis, FakeTextRenderer> = {
    ap: makeFakeTextRenderer(),
    dv: makeFakeTextRenderer(),
    ml: makeFakeTextRenderer()
  };
  return {
    renderers,
    fontAsset: makeTestFontAsset(scene),
    dispose: () => {}
  };
}

/**
 * Project a mesh's world-space centre to screen coordinates, without
 * rendering, matching how `scene.pick` interprets screen positions.
 * @param scene Scene the camera and mesh belong to.
 * @param camera Camera to project through.
 * @param meshName Name of the mesh to project.
 */
function projectPickMeshToScreen(
  scene: Scene,
  camera: ArcRotateCamera,
  meshName: string
): Vector3 {
  const mesh = scene.getMeshByName(meshName)!;
  mesh.computeWorldMatrix(true);

  const transform = camera
    .getViewMatrix()
    .multiply(camera.getProjectionMatrix());
  const engine = scene.getEngine();
  const viewport = camera.viewport.toGlobal(
    engine.getRenderWidth(),
    engine.getRenderHeight()
  );

  return Vector3.Project(
    mesh.absolutePosition,
    Matrix.Identity(),
    transform,
    viewport
  );
}

describe("orbitCameraFromAxisGuideDoubleTap", () => {
  function makeOrbitScene() {
    const scene = makeTestScene();
    const camera = new ArcRotateCamera(
      "c",
      -Math.PI / 2,
      Math.PI / 8,
      50,
      Vector3.Zero(),
      scene
    );
    scene.activeCamera = camera;
    buildAxisGuides(
      scene,
      makeTestAxisGuides(scene),
      makeAtlas(),
      { kind: "global" },
      AXIS_LABELS
    );
    const interpolateTo = vi.spyOn(camera, "interpolateTo");
    const onOrbit = vi.fn();
    orbitCameraFromAxisGuideDoubleTap(scene, camera, onOrbit);
    return { scene, camera, interpolateTo, onOrbit };
  }

  it("orbits to face +AP when the -AP label is double-clicked", () => {
    const { scene, camera, interpolateTo, onOrbit } = makeOrbitScene();
    const screen = projectPickMeshToScreen(scene, camera, "axisGuidePick_-AP");
    scene.pointerX = screen.x;
    scene.pointerY = screen.y;

    scene.onPointerObservable.notifyObservers(
      new PointerInfo(
        PointerEventTypes.POINTERDOUBLETAP,
        {} as PointerEvent,
        { pickedMesh: null } as PickingInfo
      ),
      PointerEventTypes.POINTERDOUBLETAP
    );

    expect(interpolateTo).toHaveBeenCalledTimes(1);
    const call = interpolateTo.mock.calls[0]!;
    expect(call[0]).toBeCloseTo(Math.PI / 2);
    expect(call[1]).toBeCloseTo(Math.PI / 2);
    expect(onOrbit).toHaveBeenCalledTimes(1);
    const direction = onOrbit.mock.calls[0]![0] as Vector3;
    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(1);
  });

  it("does nothing when double-clicking empty space", () => {
    const { scene, interpolateTo, onOrbit } = makeOrbitScene();
    scene.pointerX = 0;
    scene.pointerY = 0;

    scene.onPointerObservable.notifyObservers(
      new PointerInfo(
        PointerEventTypes.POINTERDOUBLETAP,
        {} as PointerEvent,
        { pickedMesh: null } as PickingInfo
      ),
      PointerEventTypes.POINTERDOUBLETAP
    );

    expect(interpolateTo).not.toHaveBeenCalled();
    expect(onOrbit).not.toHaveBeenCalled();
  });

  it("does nothing on a single tap at the -AP label's screen position", () => {
    const { scene, camera, interpolateTo } = makeOrbitScene();
    const screen = projectPickMeshToScreen(scene, camera, "axisGuidePick_-AP");
    scene.pointerX = screen.x;
    scene.pointerY = screen.y;

    scene.onPointerObservable.notifyObservers(
      new PointerInfo(
        PointerEventTypes.POINTERTAP,
        {} as PointerEvent,
        { pickedMesh: null } as PickingInfo
      ),
      PointerEventTypes.POINTERTAP
    );

    expect(interpolateTo).not.toHaveBeenCalled();
  });
});

describe("getSelectedInspectableGizmoNode", () => {
  it("resolves a selected probe's own transform node", () => {
    const { scene, probe, node } = makeProbeInScene();

    expect(getSelectedInspectableGizmoNode(scene, probe, null)).toBe(node);
  });

  it("resolves the body model node when bodyModelGizmoProbeId matches a probe with a body model", () => {
    const { scene, probe } = makeProbeInScene();
    probe.bodyModel = makeSceneModel();
    const bodyModelNode = new TransformNode(
      buildSceneEntityName(probe.id, "probe", "body-model_node"),
      scene
    );

    expect(getSelectedInspectableGizmoNode(scene, probe, probe.id)).toBe(
      bodyModelNode
    );
  });

  it("resolves a selected scene object's own transform node", () => {
    const scene = makeTestScene();
    const sceneObject = makeSceneObject();
    const node = new TransformNode(
      buildSceneEntityName(sceneObject.id, "object", "node"),
      scene
    );

    expect(getSelectedInspectableGizmoNode(scene, sceneObject, null)).toBe(
      node
    );
  });

  it("resolves null for no selection, the camera pose, and the world", () => {
    const scene = makeTestScene();

    expect(getSelectedInspectableGizmoNode(scene, null, null)).toBeNull();
    expect(
      getSelectedInspectableGizmoNode(scene, makeCameraPose(), null)
    ).toBeNull();
    expect(
      getSelectedInspectableGizmoNode(scene, WORLD_INSPECTABLE, null)
    ).toBeNull();
  });

  it("resolves null for a probe with no node in the scene", () => {
    const scene = makeTestScene();
    const probe = makeProbe({ id: "missing" });

    expect(getSelectedInspectableGizmoNode(scene, probe, null)).toBeNull();
  });
});

describe("setSceneEntitiesHidden", () => {
  it("disables the probe's transform node so a re-enabled child mesh still reports isEnabled() false", () => {
    const { scene, node } = makeProbeInScene();

    setSceneEntitiesHidden(scene, true);

    expect(node.isEnabled()).toBe(false);
    const mesh = node.getChildMeshes()[0]!;
    mesh.setEnabled(true);
    expect(mesh.isEnabled()).toBe(false);
  });

  it("re-enables the probe's transform node and its meshes when unhidden", () => {
    const { scene, node } = makeProbeInScene();
    setSceneEntitiesHidden(scene, true);

    setSceneEntitiesHidden(scene, false);

    expect(node.isEnabled()).toBe(true);
    for (const mesh of node.getChildMeshes()) {
      expect(mesh.isEnabled()).toBe(true);
    }
  });

  it("leaves atlas structure meshes untouched", () => {
    const { scene } = makeProbeInScene();
    const atlasRoot = buildAtlasRootNode(scene);
    const structureMesh = MeshBuilder.CreateBox("1_structure_mesh", {}, scene);
    structureMesh.parent = atlasRoot;

    setSceneEntitiesHidden(scene, true);

    expect(structureMesh.isEnabled()).toBe(true);
  });
});
