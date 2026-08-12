import { describe, expect, it, vi } from "vitest";
import { Color3, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import type { DragEvent, Mesh, StandardMaterial } from "@babylonjs/core";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import { addSceneObject, buildExperiment } from "@/features/experiment";
import { makeAtlas, makeSceneObject } from "@/test/fixtures";
import {
  makeTestModelFile,
  makeTestSceneWithGizmo,
  makeTestSceneWithPhysics,
  tickScene
} from "@/test/mount-helper";
import { asrToVector3 } from "./coordinate-transforms.api";
import {
  attachSceneObjectSelection,
  buildSceneObjectNode,
  createSceneObjectSyncState,
  disposeSceneObjectNode,
  getSceneObjectMeshes,
  getSceneObjectTransformNode,
  setSceneObjectScaleFromGizmoDrag,
  syncSceneObjects
} from "./scene-object-node.api";

// `buildSceneObjectNode` imports the stored model file through `ImportMeshAsync`,
// which needs the glTF plugin factory registered, mirroring the app boot.
registerBuiltInLoaders();

/**
 * Build an experiment holding one scene object, for sync tests.
 * @param overrides Fields to override on the default scene object.
 */
function makeExperimentWithSceneObject(
  overrides: Parameters<typeof makeSceneObject>[0] = {}
) {
  const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
  const sceneObject = makeSceneObject(overrides);
  addSceneObject(experiment, sceneObject);
  return { experiment, sceneObject };
}

describe("buildSceneObjectNode", () => {
  it("builds a transform node holding one colored part mesh, registered as gizmo-attachable", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const sceneObject = makeSceneObject({ color: "#00ff00" });
    const modelFile = await makeTestModelFile();

    const built = await buildSceneObjectNode(
      scene,
      sceneObject,
      modelFile,
      gizmoManager
    );

    expect(built).not.toBeNull();
    expect(built!.colliderFailed).toBe(false);
    const node = built!.node;
    expect(node.name).toBe(`${sceneObject.id}_object_node`);
    expect(node.parent!.name).toBe("atlasRoot_node");

    const meshes = getSceneObjectMeshes(scene, sceneObject.id);
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0]!;
    expect(mesh.name).toBe(`${sceneObject.id}_object_mesh0`);
    const material = mesh.material as StandardMaterial;
    expect(material.name).toBe(`${sceneObject.id}_object_material`);
    expect(material.diffuseColor.equals(Color3.FromHexString("#00ff00"))).toBe(
      true
    );

    expect(gizmoManager.attachableMeshes).toContain(mesh);
  });

  it("preserves the loader's hierarchy under one root, instead of merging it into a single primitive", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const sceneObject = makeSceneObject();
    const modelFile = await makeTestModelFile();

    const built = await buildSceneObjectNode(
      scene,
      sceneObject,
      modelFile,
      gizmoManager
    );

    const scaleNode = built!.node.getChildren()[0]!;
    expect(scaleNode.name).toBe(`${sceneObject.id}_object_scale`);
    const root = scaleNode.getChildren()[0]!;
    expect(root.name).toBe(`${sceneObject.id}_object_root`);
    const mesh = root.getChildren()[0] as Mesh;
    expect(mesh.name).toBe(`${sceneObject.id}_object_mesh0`);
    expect(mesh.getTotalVertices()).toBeGreaterThan(0);
  });

  it("returns the existing node without rebuilding when already built", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const sceneObject = makeSceneObject();
    const modelFile = await makeTestModelFile();

    const first = await buildSceneObjectNode(
      scene,
      sceneObject,
      modelFile,
      gizmoManager
    );
    const second = await buildSceneObjectNode(
      scene,
      sceneObject,
      modelFile,
      gizmoManager
    );

    expect(second!.node).toBe(first!.node);
  });
});

describe("disposeSceneObjectNode", () => {
  it("removes the node, mesh, material, and collider node", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const sceneObject = makeSceneObject();
    const modelFile = await makeTestModelFile();
    await buildSceneObjectNode(scene, sceneObject, modelFile, gizmoManager);

    disposeSceneObjectNode(scene, sceneObject.id, gizmoManager);

    expect(getSceneObjectTransformNode(scene, sceneObject.id)).toBeNull();
    expect(scene.getMeshByName(`${sceneObject.id}_object_mesh0`)).toBeNull();
    expect(
      scene.getMaterialByName(`${sceneObject.id}_object_material`)
    ).toBeNull();
    expect(
      scene.getTransformNodeByName(`${sceneObject.id}_object_collider`)
    ).toBeNull();
  });
});

describe("syncSceneObjects", () => {
  it("snaps a freshly built object to its ASR pose", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject({
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3]
    });
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      async () => modelFile
    );

    const node = getSceneObjectTransformNode(scene, sceneObject.id)!;
    expect(node.position.equals(asrToVector3(sceneObject.position))).toBe(true);
    expect(node.rotation.equals(asrToVector3(sceneObject.rotation))).toBe(true);
    expect(node.scaling.equals(Vector3.One())).toBe(true);
    const scaleNode = scene.getTransformNodeByName(
      `${sceneObject.id}_object_scale`
    )!;
    expect(scaleNode.scaling.equals(asrToVector3(sceneObject.scale))).toBe(
      true
    );
  });

  it("keeps the gizmo node's world scale uniform under a non-uniform object scale", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject({
      scale: [1, 2, 3]
    });
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      async () => modelFile
    );

    const node = getSceneObjectTransformNode(scene, sceneObject.id)!;
    const worldScale = new Vector3();
    const worldRotation = new Quaternion();
    const worldTranslation = new Vector3();
    node
      .computeWorldMatrix(true)
      .decompose(worldScale, worldRotation, worldTranslation);
    expect(
      Math.abs(Math.abs(worldScale.x) - Math.abs(worldScale.y))
    ).toBeLessThanOrEqual(1e-6);
    expect(
      Math.abs(Math.abs(worldScale.x) - Math.abs(worldScale.z))
    ).toBeLessThanOrEqual(1e-6);
  });

  it("interpolates an existing object's pose change over time", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    sceneObject.position = [5, 0, 0];
    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );

    const node = getSceneObjectTransformNode(scene, sceneObject.id)!;
    // Interpolation has started but not finished after a single small tick.
    tickScene(scene, 50);
    expect(node.position.equals(asrToVector3(sceneObject.position))).toBe(
      false
    );
    tickScene(scene, 1000);
    expect(node.position.equals(asrToVector3(sceneObject.position))).toBe(true);
  });

  it("snaps a scene object's pose immediately when snapPoses is true, with no tick", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    sceneObject.position = [5, 0, 0];
    sceneObject.rotation = [0, 0, Math.PI / 2];
    sceneObject.scale = [2, 2, 2];
    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel,
      true
    );

    const node = getSceneObjectTransformNode(scene, sceneObject.id)!;
    const scaleNode = scene.getTransformNodeByName(
      `${sceneObject.id}_object_scale`
    )!;
    expect(node.position.equals(asrToVector3(sceneObject.position))).toBe(true);
    expect(node.rotation.equals(asrToVector3(sceneObject.rotation))).toBe(true);
    expect(scaleNode.scaling.equals(asrToVector3(sceneObject.scale))).toBe(
      true
    );
  });

  it("stops an in-flight glide and snaps to the new goal when snapPoses is true", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    sceneObject.position = [5, 0, 0];
    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );

    const node = getSceneObjectTransformNode(scene, sceneObject.id)!;
    tickScene(scene, 50);
    expect(node.position.equals(asrToVector3(sceneObject.position))).toBe(
      false
    );

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel,
      true
    );
    expect(node.position.equals(asrToVector3(sceneObject.position))).toBe(true);

    tickScene(scene, 1000);
    expect(node.position.equals(asrToVector3(sceneObject.position))).toBe(true);
  });

  it("recolors the material when the object's color changes", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject({
      color: "#ff0000"
    });
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    sceneObject.color = "#0000ff";
    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );

    const material = scene.getMaterialByName(
      `${sceneObject.id}_object_material`
    ) as StandardMaterial;
    expect(material.diffuseColor.equals(Color3.FromHexString("#0000ff"))).toBe(
      true
    );
  });

  it("disables the mesh but keeps the collider physics body when hidden", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    sceneObject.visibility = "hidden";
    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );

    const mesh = getSceneObjectMeshes(scene, sceneObject.id)[0]!;
    expect(mesh.isEnabled()).toBe(false);
    expect(
      scene.getTransformNodeByName(`${sceneObject.id}_object_collider`)
        ?.physicsBody
    ).not.toBeNull();
  });

  it("removes the collider body when collidable turns off, keeping the mesh", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(
      scene.getTransformNodeByName(`${sceneObject.id}_object_collider`)
    ).not.toBeNull();

    sceneObject.collidable = false;
    const result = await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );

    expect(result.colliderChangedIds).toEqual([sceneObject.id]);

    expect(
      scene.getTransformNodeByName(`${sceneObject.id}_object_collider`)
    ).toBeNull();
    expect(getSceneObjectMeshes(scene, sceneObject.id)).toHaveLength(1);
  });

  it("builds no collider for a fresh object with collidable off, then builds one once it turns on", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject({
      collidable: false
    });
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(
      scene.getTransformNodeByName(`${sceneObject.id}_object_collider`)
    ).toBeNull();

    sceneObject.collidable = true;
    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );

    expect(
      scene.getTransformNodeByName(`${sceneObject.id}_object_collider`)
    ).not.toBeNull();
  });

  it("re-cooks the collider when the object's scale changes", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;
    const colliderName = `${sceneObject.id}_object_collider`;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    const firstCollider = scene.getTransformNodeByName(colliderName);
    expect(firstCollider).not.toBeNull();
    expect(state.colliderScales.get(sceneObject.id)).toEqual([1, 1, 1]);

    sceneObject.scale = [2, 2, 2];
    const result = await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(result.colliderChangedIds).toEqual([sceneObject.id]);

    const secondCollider = scene.getTransformNodeByName(colliderName);
    expect(secondCollider).not.toBeNull();
    expect(secondCollider).not.toBe(firstCollider);
    expect(state.colliderScales.get(sceneObject.id)).toEqual([2, 2, 2]);
  });

  it("skips pose updates for the object being dragged", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    const node = getSceneObjectTransformNode(scene, sceneObject.id)!;
    node.position = Vector3.Zero();
    sceneObject.position = [9, 9, 9];

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      sceneObject.id,
      loadModel
    );

    expect(node.position.equals(Vector3.Zero())).toBe(true);
  });

  it("disposes a node whose scene object left the experiment", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const modelFile = await makeTestModelFile();
    const state = createSceneObjectSyncState();
    const loadModel = async () => modelFile;

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    experiment.sceneObjects = [];
    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );

    expect(getSceneObjectTransformNode(scene, sceneObject.id)).toBeNull();
  });

  it("records a missing model file as failed and returns it once, without retrying on the next sync", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const state = createSceneObjectSyncState();
    const loadModel = vi.fn(async () => null);

    const firstFailures = await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(firstFailures.failedIds).toEqual([sceneObject.id]);
    expect(loadModel).toHaveBeenCalledTimes(1);

    const secondFailures = await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(secondFailures.failedIds).toEqual([]);
    expect(loadModel).toHaveBeenCalledTimes(1);
  });

  it("forgets a failure once the object leaves the experiment", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const { experiment, sceneObject } = makeExperimentWithSceneObject();
    const state = createSceneObjectSyncState();
    const loadModel = vi.fn(async () => null);

    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(state.failedIds.has(sceneObject.id)).toBe(true);

    experiment.sceneObjects = [];
    await syncSceneObjects(
      scene,
      experiment,
      gizmoManager,
      state,
      null,
      loadModel
    );
    expect(state.failedIds.has(sceneObject.id)).toBe(false);
  });
});

describe("setSceneObjectScaleFromGizmoDrag", () => {
  it("folds a scale-gizmo drag onto the scale node and leaves the gizmo node unscaled", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { sceneObject } = makeExperimentWithSceneObject();
    const node = new TransformNode(`${sceneObject.id}_object_node`, scene);
    gizmoManager.attachToNode(node);
    node.scaling.set(2, 1, 1);
    const onDrag = vi.fn();

    setSceneObjectScaleFromGizmoDrag(
      gizmoManager.gizmos.scaleGizmo!,
      [sceneObject],
      onDrag
    );
    gizmoManager.gizmos.scaleGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(sceneObject.scale).toEqual([1, 1, 2]);
    expect(node.scaling.equals(Vector3.One())).toBe(true);
    const scaleNode = scene.getTransformNodeByName(
      `${sceneObject.id}_object_scale`
    )!;
    expect(scaleNode.scaling.equals(new Vector3(2, 1, 1))).toBe(true);
    expect(onDrag).toHaveBeenCalledWith(sceneObject.id);

    node.scaling.set(3, 1, 1);
    gizmoManager.gizmos.scaleGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(sceneObject.scale).toEqual([1, 1, 6]);
    expect(node.scaling.equals(Vector3.One())).toBe(true);
    expect(scaleNode.scaling.equals(new Vector3(6, 1, 1))).toBe(true);
  });
});

describe("attachSceneObjectSelection", () => {
  it("leaves the gizmo detached but still outlines the mesh for a locked object", async () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      await makeTestSceneWithPhysics();
    const sceneObject = makeSceneObject({ lock: true });
    const modelFile = await makeTestModelFile();
    const node = (await buildSceneObjectNode(
      scene,
      sceneObject,
      modelFile,
      gizmoManager
    ))!.node;

    attachSceneObjectSelection(
      gizmoManager,
      selectionOutlineLayer,
      sceneObject,
      node
    );

    expect(gizmoManager.attachedNode).toBeNull();
    for (const mesh of getSceneObjectMeshes(scene, sceneObject.id)) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(true);
    }
  });

  it("attaches the gizmo to the node for an unlocked object", async () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      await makeTestSceneWithPhysics();
    const sceneObject = makeSceneObject({ lock: false });
    const modelFile = await makeTestModelFile();
    const node = (await buildSceneObjectNode(
      scene,
      sceneObject,
      modelFile,
      gizmoManager
    ))!.node;

    attachSceneObjectSelection(
      gizmoManager,
      selectionOutlineLayer,
      sceneObject,
      node
    );

    expect(gizmoManager.attachedNode).toBe(node);
  });
});
