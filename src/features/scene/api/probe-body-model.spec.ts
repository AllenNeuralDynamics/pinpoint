import { describe, expect, it, vi } from "vitest";
import type { DragEvent, DragStartEndEvent, Scene } from "@babylonjs/core";
import { TransformNode, Vector3 } from "@babylonjs/core";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import {
  addProbe,
  buildExperiment,
  internProbeInterfaceProbe
} from "@/features/experiment";
import type { Experiment } from "@/features/experiment";
import type { Probe } from "@/features/probe";
import { getProbeInterfaceIdentifier } from "@/features/probe";
import {
  makeAtlas,
  makeProbe,
  makeProbeGeometry,
  makeProbeInterfaceProbe,
  makeSceneModel
} from "@/test/fixtures";
import {
  makeTestModelFile,
  makeTestSceneWithGizmo,
  makeTestSceneWithPhysics
} from "@/test/mount-helper";
import { buildProbe, getProbeTransformNode } from "./probe.api";
import {
  buildProbeBodyModelNode,
  createProbeBodyModelSyncState,
  endProbeBodyModelGizmoDrag,
  getProbeBodyModelMeshes,
  getProbeBodyModelNode,
  getProbeGizmoNode,
  setProbeBodyModelPositionFromGizmoDrag,
  setProbeBodyModelRotationFromGizmoDrag,
  setProbeBodyModelScaleFromGizmoDrag,
  syncProbeBodyModels
} from "./probe-body-model.api";

// `buildProbeBodyModelNode` imports the stored model file through
// `ImportMeshAsync`, which needs the glTF plugin factory registered,
// mirroring the app boot.
registerBuiltInLoaders();

/** Single-shank contour (imec NP1000), in micrometers. */
const NP1000_CONTOUR = [
  [-11, 9989],
  [-11, -11],
  [24, -220],
  [59, -11],
  [59, 9989]
];

/**
 * Build an experiment with a single interned probe interface definition and a
 * probe referencing it, with a valid contour so the scene-level `buildProbe`
 * can build its node.
 * @param probeOverrides Fields to override on the default probe.
 */
function makeExperimentWithProbe(probeOverrides: Partial<Probe> = {}): {
  experiment: Experiment;
  probe: Probe;
} {
  const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
  const probeInterfaceProbe = makeProbeInterfaceProbe({
    probe_planar_contour: NP1000_CONTOUR
  });
  internProbeInterfaceProbe(experiment, probeInterfaceProbe);

  const probe = makeProbe({
    probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe),
    ...probeOverrides
  });
  addProbe(experiment, probe);

  return { experiment, probe };
}

describe("buildProbeBodyModelNode", () => {
  it("builds one part mesh under the probe node, skinned with the probe's own material, disposing the loader's own material", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    const modelFile = await makeTestModelFile();

    const node = await buildProbeBodyModelNode(
      scene,
      probe,
      modelFile,
      gizmoManager
    );

    expect(node).not.toBeNull();
    expect(node!.name).toBe(`${probe.id}_probe_body-model_node`);
    expect(node!.parent!.name).toBe(`${probe.id}_probe_node`);

    const meshes = getProbeBodyModelMeshes(scene, probe.id);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.name).toBe(`${probe.id}_probe_body-model_mesh0`);
    expect(meshes[0]!.material!.name).toBe(`${probe.id}_probe_material`);
    expect(gizmoManager.attachableMeshes).toContain(meshes[0]);

    // Only the probe's own material remains -- the loader's own material,
    // which the box's glTF export carries, was disposed rather than left
    // orphaned in the scene.
    expect(scene.materials.map(material => material.name)).toEqual([
      `${probe.id}_probe_material`
    ]);
  });

  it("returns the existing node without rebuilding when already built", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    const modelFile = await makeTestModelFile();

    const first = await buildProbeBodyModelNode(
      scene,
      probe,
      modelFile,
      gizmoManager
    );
    const second = await buildProbeBodyModelNode(
      scene,
      probe,
      modelFile,
      gizmoManager
    );

    expect(second).toBe(first);
  });
});

describe("syncProbeBodyModels", () => {
  it("applies the body model's local pose to the node unswapped, not through ASR", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel({
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [2, 3, 4]
    });
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    const modelFile = await makeTestModelFile();
    const state = createProbeBodyModelSyncState();

    await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      async () => modelFile
    );

    const node = getProbeBodyModelNode(scene, probe.id)!;
    expect([node.position.x, node.position.y, node.position.z]).toEqual([
      1, 2, 3
    ]);
    expect([node.rotation.x, node.rotation.y, node.rotation.z]).toEqual([
      0.1, 0.2, 0.3
    ]);
    expect([node.scaling.x, node.scaling.y, node.scaling.z]).toEqual([1, 1, 1]);
    const scaleNode = scene.getTransformNodeByName(
      `${probe.id}_probe_body-model_scale`
    )!;
    expect([
      scaleNode.scaling.x,
      scaleNode.scaling.y,
      scaleNode.scaling.z
    ]).toEqual([2, 3, 4]);
  });

  it('hides the body model for "shanks" and "hidden" visibility', async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({
      bodyModel,
      visibility: "visible"
    });
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    const modelFile = await makeTestModelFile();
    const state = createProbeBodyModelSyncState();
    const loadModel = async () => modelFile;

    await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    const node = getProbeBodyModelNode(scene, probe.id)!;
    expect(node.isEnabled()).toBe(true);

    probe.visibility = "shanks";
    await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(node.isEnabled()).toBe(false);

    probe.visibility = "hidden";
    await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(node.isEnabled()).toBe(false);
  });

  it("cooks a collider that re-cooks on a pose change but not on an unchanged second sync", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    const modelFile = await makeTestModelFile();
    const state = createProbeBodyModelSyncState();
    const loadModel = async () => modelFile;
    const colliderName = `${probe.id}_probe_collider`;

    await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    const firstCollider = scene.getTransformNodeByName(colliderName);
    expect(firstCollider).not.toBeNull();

    const unchanged = await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(unchanged.colliderChangedIds).toEqual([]);
    expect(scene.getTransformNodeByName(colliderName)).toBe(firstCollider);

    probe.bodyModel!.scale = [2, 2, 2];
    const changed = await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(changed.colliderChangedIds).toEqual([probe.id]);
    const secondCollider = scene.getTransformNodeByName(colliderName);
    expect(secondCollider).not.toBeNull();
    expect(secondCollider).not.toBe(firstCollider);
  });

  it("records a missing model file as failed and returns it once, without retrying on the next sync", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    const state = createProbeBodyModelSyncState();
    const loadModel = vi.fn(async () => null);

    const first = await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(first.failedIds).toEqual([probe.id]);
    expect(loadModel).toHaveBeenCalledTimes(1);

    const second = await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(second.failedIds).toEqual([]);
    expect(loadModel).toHaveBeenCalledTimes(1);
  });

  it("does not sync a probe whose transform node isn't built yet, and doesn't mark it failed", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    const state = createProbeBodyModelSyncState();
    const loadModel = vi.fn(async () => await makeTestModelFile());

    expect(getProbeTransformNode(scene, probe.id)).toBeNull();

    const result = await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );

    expect(result.failedIds).toEqual([]);
    expect(loadModel).not.toHaveBeenCalled();
    expect(state.failedIds.has(probe.id)).toBe(false);
  });
});

describe("getProbeGizmoNode", () => {
  it("returns the body model node when bodyModelGizmoProbeId matches the probe", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    const probeNode = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    const modelFile = await makeTestModelFile();
    const bodyModelNode = await buildProbeBodyModelNode(
      scene,
      probe,
      modelFile,
      gizmoManager
    );

    expect(getProbeGizmoNode(scene, probe, probeNode, probe.id)).toBe(
      bodyModelNode
    );
  });

  it("returns the probe node when bodyModelGizmoProbeId does not match the probe", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    const probeNode = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    const modelFile = await makeTestModelFile();
    await buildProbeBodyModelNode(scene, probe, modelFile, gizmoManager);

    expect(getProbeGizmoNode(scene, probe, probeNode, null)).toBe(probeNode);
    expect(getProbeGizmoNode(scene, probe, probeNode, "other-id")).toBe(
      probeNode
    );
  });

  it("returns the probe node when the body model node was never built", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    const probeNode = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;

    expect(getProbeGizmoNode(scene, probe, probeNode, probe.id)).toBe(
      probeNode
    );
  });
});

/**
 * Build a bare transform node named like a probe's body model node, without
 * importing a real model file - the drag handlers resolve purely by name.
 * @param scene Scene to build the node in.
 * @param probeId Probe id the node's name is derived from.
 */
function makeBodyModelNode(scene: Scene, probeId: string) {
  return new TransformNode(`${probeId}_probe_body-model_node`, scene);
}

describe("setProbeBodyModelPositionFromGizmoDrag", () => {
  it("writes the attached body model's local position and notifies onDrag", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { probe } = makeExperimentWithProbe({ bodyModel: makeSceneModel() });
    const node = makeBodyModelNode(scene, probe.id);
    gizmoManager.attachToNode(node);
    node.position.set(1, 2, 3);
    const onDrag = vi.fn();

    setProbeBodyModelPositionFromGizmoDrag(
      gizmoManager.gizmos.positionGizmo!,
      [probe],
      onDrag
    );
    gizmoManager.gizmos.positionGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(probe.bodyModel!.position).toEqual([1, 2, 3]);
    expect(onDrag).toHaveBeenCalledWith(probe.id);
  });

  it("ignores a gizmo attached to the probe's own node", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({
      bodyModel: makeSceneModel()
    });
    const probeNode = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    gizmoManager.attachToNode(probeNode);
    const onDrag = vi.fn();

    setProbeBodyModelPositionFromGizmoDrag(
      gizmoManager.gizmos.positionGizmo!,
      [probe],
      onDrag
    );
    gizmoManager.gizmos.positionGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(onDrag).not.toHaveBeenCalled();
  });
});

describe("setProbeBodyModelRotationFromGizmoDrag", () => {
  it("writes the attached body model's local rotation and notifies onDrag", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { probe } = makeExperimentWithProbe({ bodyModel: makeSceneModel() });
    const node = makeBodyModelNode(scene, probe.id);
    gizmoManager.attachToNode(node);
    node.rotation.set(0.1, 0.2, 0.3);
    const onDrag = vi.fn();

    setProbeBodyModelRotationFromGizmoDrag(
      gizmoManager.gizmos.rotationGizmo!,
      [probe],
      onDrag
    );
    gizmoManager.gizmos.rotationGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(probe.bodyModel!.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(onDrag).toHaveBeenCalledWith(probe.id);
  });

  it("ignores a gizmo attached to the probe's own node", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({
      bodyModel: makeSceneModel()
    });
    const probeNode = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    gizmoManager.attachToNode(probeNode);
    const onDrag = vi.fn();

    setProbeBodyModelRotationFromGizmoDrag(
      gizmoManager.gizmos.rotationGizmo!,
      [probe],
      onDrag
    );
    gizmoManager.gizmos.rotationGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(onDrag).not.toHaveBeenCalled();
  });
});

describe("setProbeBodyModelScaleFromGizmoDrag", () => {
  it("writes the attached body model's local scale and notifies onDrag", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { probe } = makeExperimentWithProbe({ bodyModel: makeSceneModel() });
    const node = makeBodyModelNode(scene, probe.id);
    gizmoManager.attachToNode(node);
    node.scaling.set(2, 3, 4);
    const onDrag = vi.fn();

    setProbeBodyModelScaleFromGizmoDrag(
      gizmoManager.gizmos.scaleGizmo!,
      [probe],
      onDrag
    );
    gizmoManager.gizmos.scaleGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(probe.bodyModel!.scale).toEqual([2, 3, 4]);
    expect(onDrag).toHaveBeenCalledWith(probe.id);

    node.scaling.set(3, 1, 1);
    gizmoManager.gizmos.scaleGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(probe.bodyModel!.scale).toEqual([6, 3, 4]);
    expect(node.scaling.equals(Vector3.One())).toBe(true);
  });

  it("ignores a gizmo attached to the probe's own node", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({
      bodyModel: makeSceneModel()
    });
    const probeNode = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    gizmoManager.attachToNode(probeNode);
    const onDrag = vi.fn();

    setProbeBodyModelScaleFromGizmoDrag(
      gizmoManager.gizmos.scaleGizmo!,
      [probe],
      onDrag
    );
    gizmoManager.gizmos.scaleGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(onDrag).not.toHaveBeenCalled();
  });
});

describe("endProbeBodyModelGizmoDrag", () => {
  it("fires the callback for a body-model node on all three gizmos", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { probe } = makeExperimentWithProbe();
    const node = makeBodyModelNode(scene, probe.id);
    const gizmos = {
      positionGizmo: gizmoManager.gizmos.positionGizmo!,
      rotationGizmo: gizmoManager.gizmos.rotationGizmo!,
      scaleGizmo: gizmoManager.gizmos.scaleGizmo!
    };
    const onDragEnd = vi.fn();
    endProbeBodyModelGizmoDrag(gizmos, onDragEnd);

    gizmoManager.attachToNode(node);
    gizmos.positionGizmo.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );
    gizmos.rotationGizmo.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );
    gizmos.scaleGizmo.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );

    expect(onDragEnd).toHaveBeenCalledTimes(3);
  });

  it("never fires for the probe's own node", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({
      bodyModel: makeSceneModel()
    });
    const probeNode = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    const gizmos = {
      positionGizmo: gizmoManager.gizmos.positionGizmo!,
      rotationGizmo: gizmoManager.gizmos.rotationGizmo!,
      scaleGizmo: gizmoManager.gizmos.scaleGizmo!
    };
    const onDragEnd = vi.fn();
    endProbeBodyModelGizmoDrag(gizmos, onDragEnd);

    gizmoManager.attachToNode(probeNode);
    gizmos.positionGizmo.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );

    expect(onDragEnd).not.toHaveBeenCalled();
  });
});

describe("syncProbeBodyModels with draggedProbeId", () => {
  it("skips pose and collider updates while dragged, then re-cooks once released", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const bodyModel = makeSceneModel();
    const { experiment, probe } = makeExperimentWithProbe({ bodyModel });
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    const modelFile = await makeTestModelFile();
    const state = createProbeBodyModelSyncState();
    const loadModel = async () => modelFile;

    await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    const node = getProbeBodyModelNode(scene, probe.id)!;

    probe.bodyModel!.position = [5, 6, 7];
    const dragged = await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      probe.id,
      loadModel
    );

    expect([node.position.x, node.position.y, node.position.z]).toEqual([
      0, 0, 0
    ]);
    expect(dragged.colliderChangedIds).toEqual([]);

    const released = await syncProbeBodyModels(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );

    expect([node.position.x, node.position.y, node.position.z]).toEqual([
      5, 6, 7
    ]);
    expect(released.colliderChangedIds).toEqual([probe.id]);
  });
});
