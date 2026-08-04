import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  DragEvent,
  DragStartEndEvent,
  Scene,
  StandardMaterial
} from "@babylonjs/core";
import { Color3, TransformNode } from "@babylonjs/core";
import type { Experiment } from "@/features/experiment";
import {
  addProbe,
  buildExperiment,
  internProbeInterfaceProbe
} from "@/features/experiment";
import type { Probe } from "@/features/probe";
import { getProbeInterfaceIdentifier } from "@/features/probe";
import { makeAtlas, makeProbe, makeProbeInterfaceProbe } from "@/test/fixtures";
import {
  initializeTestCSG2,
  makeTestSceneWithGizmo
} from "@/test/mount-helper";
import {
  attachProbeSelection,
  buildProbe,
  disposeProbe,
  endProbeGizmoDrag,
  getProbeTransformNode,
  selectProbeFromGizmoAttach,
  setProbePositionFromGizmoDrag,
  setProbeRotationFromGizmoDrag,
  syncProbes
} from "./probe.api";
import { asrToVector3, vector3ToAsr } from "./coordinate-transforms.api";

// The head stage is CSG2-subtracted; initialize it once for every test in
// this file, mirroring what `babylon-runtime.service.ts` does at startup.
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

/** Four-shank contour (imec NP2020), in micrometers. */
const NP2020_CONTOUR = [
  [-27, 9989],
  [-27, -11],
  [8, -217],
  [43, -11],
  [43, 9989],
  [223, 9989],
  [223, -11],
  [258, -217],
  [293, -11],
  [293, 9989],
  [473, 9989],
  [473, -11],
  [508, -217],
  [543, -11],
  [543, 9989],
  [723, 9989],
  [723, -11],
  [758, -217],
  [793, -11],
  [793, 9989]
];

/**
 * Build an experiment with a single interned probe interface definition and
 * a probe referencing it.
 */
function makeExperimentWithProbe(
  probeOverrides: Partial<Probe> = {},
  probeInterfaceOverrides: Partial<
    Parameters<typeof makeProbeInterfaceProbe>[0]
  > = {}
): { experiment: Experiment; probe: Probe } {
  const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
  const probeInterfaceProbe = makeProbeInterfaceProbe({
    probe_planar_contour: NP1000_CONTOUR,
    ...probeInterfaceOverrides
  });
  internProbeInterfaceProbe(experiment, probeInterfaceProbe);

  const probe = makeProbe({
    probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe),
    ...probeOverrides
  });
  addProbe(experiment, probe);

  return { experiment, probe };
}

/** Shank, head stage, and rod mesh names for a probe. */
function probeMeshNames(probeId: string) {
  return {
    shank: `${probeId}_probe_shank_mesh`,
    headStage: `${probeId}_probe_head-stage_mesh`,
    rod: `${probeId}_probe_rod_mesh`
  };
}

/** Round every component of a bounding box's min/max to a fixed precision. */
function roundedBounds(scene: Scene, meshName: string) {
  const mesh = scene.getMeshByName(meshName)!;
  mesh.computeWorldMatrix(true);
  const { minimumWorld, maximumWorld } = mesh.getBoundingInfo().boundingBox;
  const round = (n: number) => Math.round(n * 1e6) / 1e6 || 0;
  return {
    min: [round(minimumWorld.x), round(minimumWorld.y), round(minimumWorld.z)],
    max: [round(maximumWorld.x), round(maximumWorld.y), round(maximumWorld.z)]
  };
}

/**
 * Sum of triangle areas in a mesh's local extrusion cap (local y ≈ 0),
 * halved because `DOUBLESIDE` duplicates the cap's vertices back-to-back.
 */
function capTriangleArea(scene: Scene, meshName: string): number {
  const mesh = scene.getMeshByName(meshName)!;
  const positions = mesh.getVerticesData("position")!;
  const indices = mesh.getIndices()!;

  let area = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const vertexIndices = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
    const points = vertexIndices.map(index => ({
      x: positions[index * 3]!,
      y: positions[index * 3 + 1]!,
      z: positions[index * 3 + 2]!
    }));
    if (points.some(point => Math.abs(point.y) > 1e-9)) continue;

    const [a, b, c] = points;
    area +=
      Math.abs((b!.x - a!.x) * (c!.z - a!.z) - (c!.x - a!.x) * (b!.z - a!.z)) /
      2;
  }
  return area / 2;
}

describe("getProbeTransformNode", () => {
  it("returns null when the probe has no transform node", () => {
    const { scene } = makeTestSceneWithGizmo();
    expect(getProbeTransformNode(scene, "missing")).toBeNull();
  });

  it("returns the probe's transform node by id", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    const node = buildProbe(scene, probe, experiment, gizmoManager);

    expect(getProbeTransformNode(scene, probe.id)).toBe(node);
  });
});

describe("buildProbe", () => {
  it("builds a transform node with the shank, head stage, and rod meshes parented under it", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    const node = buildProbe(scene, probe, experiment, gizmoManager);

    expect(node).not.toBeNull();
    expect(node!.name).toBe(`${probe.id}_probe_node`);

    const names = probeMeshNames(probe.id);
    const children = node!.getChildMeshes().map(mesh => mesh.name);
    expect(children).toHaveLength(3);
    expect(children).toEqual(
      expect.arrayContaining([names.shank, names.headStage, names.rod])
    );
  });

  it("parents the probe node to the reference coordinate node under the atlas root", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    const node = buildProbe(scene, probe, experiment, gizmoManager);

    expect(node!.parent!.name).toBe("referenceCoordinate_node");
    expect(node!.parent!.parent!.name).toBe("atlasRoot_node");
  });

  it("registers the shank, head stage, and rod meshes as gizmo-attachable", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    buildProbe(scene, probe, experiment, gizmoManager);

    const names = probeMeshNames(probe.id);
    const attachableNames = gizmoManager.attachableMeshes!.map(
      mesh => mesh.name
    );
    expect(attachableNames).toEqual(
      expect.arrayContaining([names.shank, names.headStage, names.rod])
    );
  });

  it("extrudes the shank standing tip-first at the probe's center tip", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    buildProbe(scene, probe, experiment, gizmoManager);

    const bounds = roundedBounds(scene, probeMeshNames(probe.id).shank);
    expect(bounds.min).toEqual([-0.035, -0.025, -10.209]);
    expect(bounds.max).toEqual([0.035, 0.025, 0]);
  });

  it("places the head stage cone above the shank, as wide as the contour", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    buildProbe(scene, probe, experiment, gizmoManager);

    const bounds = roundedBounds(scene, probeMeshNames(probe.id).headStage);
    expect(bounds.min).toEqual([-4, -4, -30.209]);
    expect(bounds.max).toEqual([4, 4, -10.209]);
  });

  it("places the rod above the head stage", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    buildProbe(scene, probe, experiment, gizmoManager);

    const bounds = roundedBounds(scene, probeMeshNames(probe.id).rod);
    expect(bounds.min).toEqual([-4, -4, -230.209]);
    expect(bounds.max).toEqual([4, 4, -30.209]);
  });

  it("centers a multi-shank contour on its bounding box and preserves its area", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe(
      {},
      { probe_planar_contour: NP2020_CONTOUR }
    );

    buildProbe(scene, probe, experiment, gizmoManager);

    const bounds = roundedBounds(scene, probeMeshNames(probe.id).shank);
    expect(bounds.min[0]).toBeCloseTo(-0.41, 6);
    expect(bounds.max[0]).toBeCloseTo(0.41, 6);
    expect(bounds.min[2]).toBeCloseTo(-10.206, 6);
  });

  it("triangulates the shank's cap to match the contour's true area, including a multi-shank comb", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const single = makeExperimentWithProbe();
    buildProbe(scene, single.probe, single.experiment, gizmoManager);

    const singleArea = capTriangleArea(
      scene,
      probeMeshNames(single.probe.id).shank
    );
    expect(singleArea).toBeCloseTo(0.707315, 6);

    const multi = makeExperimentWithProbe(
      {},
      { probe_planar_contour: NP2020_CONTOUR }
    );
    buildProbe(scene, multi.probe, multi.experiment, gizmoManager);
    const multiArea = capTriangleArea(
      scene,
      probeMeshNames(multi.probe.id).shank
    );
    expect(multiArea).toBeCloseTo(2.82884, 6);
  });

  it("shares one material between the shank and head stage, colored from the probe", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({ color: "#336699" });

    buildProbe(scene, probe, experiment, gizmoManager);

    const names = probeMeshNames(probe.id);
    const shankMaterial = scene.getMeshByName(names.shank)!.material;
    const headStageMaterial = scene.getMeshByName(names.headStage)!.material;

    expect(shankMaterial).toBe(headStageMaterial);
    expect(shankMaterial!.name).toBe(`${probe.id}_probe_material`);
    expect(
      (shankMaterial as StandardMaterial).diffuseColor.equals(
        Color3.FromHexString("#336699")
      )
    ).toBe(true);
  });

  it("gives the rod a separate, shared grey material", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const a = makeExperimentWithProbe();
    const b = makeExperimentWithProbe();

    buildProbe(scene, a.probe, a.experiment, gizmoManager);
    buildProbe(scene, b.probe, b.experiment, gizmoManager);

    const rodMaterialA = scene.getMeshByName(
      probeMeshNames(a.probe.id).rod
    )!.material;
    const rodMaterialB = scene.getMeshByName(
      probeMeshNames(b.probe.id).rod
    )!.material;

    expect(rodMaterialA!.name).toBe("probe_rod_material");
    expect(rodMaterialA).toBe(rodMaterialB);
    expect(
      scene.materials.filter(material => material.name === "probe_rod_material")
    ).toHaveLength(1);
  });

  it("returns the existing entity on a second call, leaving one node, three meshes, and one material", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    buildProbe(scene, probe, experiment, gizmoManager);
    buildProbe(scene, probe, experiment, gizmoManager);

    expect(
      scene.transformNodes.filter(
        node => node.name === `${probe.id}_probe_node`
      )
    ).toHaveLength(1);
    expect(scene.meshes).toHaveLength(3);
    expect(
      scene.materials.filter(
        material => material.name === `${probe.id}_probe_material`
      )
    ).toHaveLength(1);
  });

  it("returns the same node and meshes on a second call, ignoring a color changed in between", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({ color: "#ff0000" });

    const node = buildProbe(scene, probe, experiment, gizmoManager);
    const shankMesh = scene.getMeshByName(probeMeshNames(probe.id).shank);

    probe.color = "#00ff00";
    const rebuiltNode = buildProbe(scene, probe, experiment, gizmoManager);

    expect(rebuiltNode).toBe(node);
    expect(scene.getMeshByName(probeMeshNames(probe.id).shank)).toBe(shankMesh);
    const material = shankMesh!.material as StandardMaterial;
    expect(material.diffuseColor.equals(Color3.FromHexString("#ff0000"))).toBe(
      true
    );
  });

  it("reflects a changed probe color after an explicit dispose and rebuild", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({ color: "#ff0000" });

    buildProbe(scene, probe, experiment, gizmoManager);
    probe.color = "#00ff00";
    disposeProbe(scene, probe.id, gizmoManager);
    buildProbe(scene, probe, experiment, gizmoManager);

    const material = scene.getMeshByName(probeMeshNames(probe.id).shank)!
      .material as StandardMaterial;
    expect(material.diffuseColor.equals(Color3.FromHexString("#00ff00"))).toBe(
      true
    );
  });

  it("does not dispose the shared rod material when another probe is rebuilt", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const a = makeExperimentWithProbe();
    const b = makeExperimentWithProbe();

    buildProbe(scene, a.probe, a.experiment, gizmoManager);
    buildProbe(scene, b.probe, b.experiment, gizmoManager);
    disposeProbe(scene, a.probe.id, gizmoManager);
    buildProbe(scene, a.probe, a.experiment, gizmoManager);

    const rodMaterialB = scene.getMeshByName(
      probeMeshNames(b.probe.id).rod
    )!.material!;
    expect(scene.materials).toContain(rodMaterialB);
    expect(
      scene.materials.filter(material => material.name === "probe_rod_material")
    ).toHaveLength(1);
  });

  it("returns null and adds nothing when the probe interface definition is not interned", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const probe = makeProbe({
      probeInterfaceIdentifier: "missing manufacturer"
    });

    const node = buildProbe(scene, probe, experiment, gizmoManager);

    expect(node).toBeNull();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    expect(scene.transformNodes).toHaveLength(0);
  });

  it("returns null and adds nothing when the probe interface definition has no contour", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const probeInterfaceProbe = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, probeInterfaceProbe);
    const probe = makeProbe({
      probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe)
    });
    addProbe(experiment, probe);

    const node = buildProbe(scene, probe, experiment, gizmoManager);

    expect(node).toBeNull();
    expect(scene.meshes).toHaveLength(0);
  });

  it("returns null when the contour has fewer than 3 points", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe(
      {},
      {
        probe_planar_contour: [
          [0, 0],
          [1, 1]
        ]
      }
    );

    const node = buildProbe(scene, probe, experiment, gizmoManager);

    expect(node).toBeNull();
  });

  it("scales millimeter contours 1000x smaller than the equivalent micrometer contour", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const micrometers = makeExperimentWithProbe();
    buildProbe(scene, micrometers.probe, micrometers.experiment, gizmoManager);
    const micrometerBounds = roundedBounds(
      scene,
      probeMeshNames(micrometers.probe.id).shank
    );

    const millimeters = makeExperimentWithProbe({}, { si_units: "mm" });
    buildProbe(scene, millimeters.probe, millimeters.experiment, gizmoManager);
    const millimeterBounds = roundedBounds(
      scene,
      probeMeshNames(millimeters.probe.id).shank
    );

    expect(millimeterBounds.max[0]).toBeCloseTo(
      micrometerBounds.max[0]! * 1000,
      6
    );
    expect(millimeterBounds.min[2]).toBeCloseTo(
      micrometerBounds.min[2]! * 1000,
      6
    );
  });

  it("falls back to micrometers for an unrecognized si_units value", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const known = makeExperimentWithProbe();
    buildProbe(scene, known.probe, known.experiment, gizmoManager);
    const knownBounds = roundedBounds(
      scene,
      probeMeshNames(known.probe.id).shank
    );

    const unknown = makeExperimentWithProbe({}, { si_units: "nonsense" });
    buildProbe(scene, unknown.probe, unknown.experiment, gizmoManager);
    const unknownBounds = roundedBounds(
      scene,
      probeMeshNames(unknown.probe.id).shank
    );

    expect(unknownBounds).toEqual(knownBounds);
  });
});

describe("disposeProbe", () => {
  it("detaches the gizmo when it was attached to the disposed probe's node", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(scene, probe, experiment, gizmoManager);
    gizmoManager.attachToNode(node);

    disposeProbe(scene, probe.id, gizmoManager);

    expect(gizmoManager.attachedNode).toBeNull();
  });

  it("leaves the gizmo attached to an unrelated node", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const a = makeExperimentWithProbe();
    const b = makeExperimentWithProbe();
    buildProbe(scene, a.probe, a.experiment, gizmoManager);
    const nodeB = buildProbe(scene, b.probe, b.experiment, gizmoManager);
    gizmoManager.attachToNode(nodeB);

    disposeProbe(scene, a.probe.id, gizmoManager);

    expect(gizmoManager.attachedNode).toBe(nodeB);
  });

  it("does not throw when no probe was ever built for this manager", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    expect(() => disposeProbe(scene, "missing", gizmoManager)).not.toThrow();
  });
});

describe("syncProbes", () => {
  it("freezes a probe's material and the shared rod material", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    syncProbes(scene, experiment, gizmoManager, null);

    expect(
      scene.getMaterialByName(`${probe.id}_probe_material`)!.isFrozen
    ).toBe(true);
    expect(scene.getMaterialByName("probe_rod_material")!.isFrozen).toBe(true);
  });

  it("applies a changed probe color to its frozen material", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({
      color: "#ff0000"
    });
    syncProbes(scene, experiment, gizmoManager, null);

    probe.color = "#00ff00";
    syncProbes(scene, experiment, gizmoManager, null);

    const material = scene.getMaterialByName(
      `${probe.id}_probe_material`
    ) as StandardMaterial;
    expect(material.diffuseColor.equals(Color3.FromHexString("#00ff00"))).toBe(
      true
    );
    expect(material.isFrozen).toBe(true);
  });

  it("forces a probe's frozen material to rebind when its color changes", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({
      color: "#ff0000"
    });
    syncProbes(scene, experiment, gizmoManager, null);

    const material = scene.getMaterialByName(`${probe.id}_probe_material`)!;
    const markDirtySpy = vi.spyOn(material, "markDirty");

    probe.color = "#00ff00";
    syncProbes(scene, experiment, gizmoManager, null);

    expect(markDirtySpy).toHaveBeenCalledWith(true);
  });

  it("leaves a frozen probe material untouched when nothing changed", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    syncProbes(scene, experiment, gizmoManager, null);

    const material = scene.getMaterialByName(`${probe.id}_probe_material`)!;
    const markDirtySpy = vi.spyOn(material, "markDirty");

    syncProbes(scene, experiment, gizmoManager, null);

    expect(markDirtySpy).not.toHaveBeenCalled();
  });

  it("keeps the shared rod material frozen without re-freezing it when another probe is added", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment } = makeExperimentWithProbe();
    syncProbes(scene, experiment, gizmoManager, null);

    const rodMaterial = scene.getMaterialByName("probe_rod_material")!;
    const markDirtySpy = vi.spyOn(rodMaterial, "markDirty");

    const other = makeProbe({
      probeInterfaceIdentifier: experiment.probes[0]!.probeInterfaceIdentifier
    });
    addProbe(experiment, other);
    syncProbes(scene, experiment, gizmoManager, null);

    expect(rodMaterial.isFrozen).toBe(true);
    expect(markDirtySpy).not.toHaveBeenCalled();
  });

  it("returns the ids of probes it disposed and rebuilt due to a type change", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    syncProbes(scene, experiment, gizmoManager, null);
    const oldNode = getProbeTransformNode(scene, probe.id)!;

    const newProbeInterfaceProbe = makeProbeInterfaceProbe({
      probe_planar_contour: NP2020_CONTOUR,
      annotations: { manufacturer: "imec", model_name: "np2020" }
    });
    internProbeInterfaceProbe(experiment, newProbeInterfaceProbe);
    probe.probeInterfaceIdentifier = getProbeInterfaceIdentifier(
      newProbeInterfaceProbe
    );

    const rebuilt = syncProbes(scene, experiment, gizmoManager, null);

    expect(rebuilt).toEqual([probe.id]);
    expect(oldNode.isDisposed()).toBe(true);
    expect(getProbeTransformNode(scene, probe.id)).not.toBeNull();
    expect(getProbeTransformNode(scene, probe.id)).not.toBe(oldNode);
  });

  it("does not report a probe as rebuilt when nothing changed", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment } = makeExperimentWithProbe();
    syncProbes(scene, experiment, gizmoManager, null);

    const rebuilt = syncProbes(scene, experiment, gizmoManager, null);

    expect(rebuilt).toEqual([]);
  });

  it("detaches the gizmo and desyncs the outline layer when the selected probe's type changes, until the caller reattaches", () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    syncProbes(scene, experiment, gizmoManager, null);
    const oldNode = getProbeTransformNode(scene, probe.id)!;
    const oldShankMesh = scene.getMeshByName(probeMeshNames(probe.id).shank)!;
    attachProbeSelection(gizmoManager, selectionOutlineLayer, probe, oldNode);

    const newProbeInterfaceProbe = makeProbeInterfaceProbe({
      probe_planar_contour: NP2020_CONTOUR,
      annotations: { manufacturer: "imec", model_name: "np2020" }
    });
    internProbeInterfaceProbe(experiment, newProbeInterfaceProbe);
    probe.probeInterfaceIdentifier = getProbeInterfaceIdentifier(
      newProbeInterfaceProbe
    );
    const rebuilt = syncProbes(scene, experiment, gizmoManager, null);

    // Left dangling right after the type-changing sync: this is the bug the
    // caller (SceneCanvas.vue) must react to.
    expect(rebuilt).toContain(probe.id);
    expect(gizmoManager.attachedNode).not.toBe(oldNode);
    expect(gizmoManager.attachedNode).toBeNull();

    // Once reattached (what SceneCanvas.vue now does on a rebuild), the
    // gizmo and outline point at the new entity, not the disposed one.
    const newNode = getProbeTransformNode(scene, probe.id)!;
    attachProbeSelection(gizmoManager, selectionOutlineLayer, probe, newNode);

    expect(gizmoManager.attachedNode).toBe(newNode);
    for (const mesh of newNode.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(true);
    }
    expect(selectionOutlineLayer.hasMesh(oldShankMesh)).toBe(false);
  });

  it("writes a plain, rotation-independent position (regression: gizmo drag no longer snaps after a rotation)", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    probe.rotation = [0, 0, Math.PI / 2];
    probe.tipPosition = [5, 0, 0];

    syncProbes(scene, experiment, gizmoManager, null);
    const node = getProbeTransformNode(scene, probe.id)!;
    const firstPass = node.position.clone();

    // The old `setPositionWithLocalVector` write drifted on a second pass at
    // a non-zero rotation (e.g. (0,-5,0) -> (0,0,-5)); a plain assignment is
    // idempotent regardless of rotation.
    syncProbes(scene, experiment, gizmoManager, null);

    expect(node.position.asArray()).toEqual(firstPass.asArray());
    expect(node.position.asArray()).toEqual(
      asrToVector3(probe.tipPosition).asArray()
    );
  });

  it.each([[[0, 0, 0]], [[0, 0, Math.PI / 2]], [[0.3, 0.4, 0.5]]] as [
    [number, number, number]
  ][])(
    "round-trips a tip position through sync and a drag readback at rotation %j",
    rotation => {
      const { scene, gizmoManager } = makeTestSceneWithGizmo();
      const { experiment, probe } = makeExperimentWithProbe();
      probe.rotation = rotation;
      probe.tipPosition = [1, 2, 3];

      syncProbes(scene, experiment, gizmoManager, null);
      const node = getProbeTransformNode(scene, probe.id)!;

      // Exactly what setProbePositionFromGizmoDrag's readback does.
      probe.tipPosition = vector3ToAsr(node.position);
      syncProbes(scene, experiment, gizmoManager, null);

      expect(probe.tipPosition).toEqual([1, 2, 3]);
      expect(node.position.asArray()).toEqual(
        asrToVector3(probe.tipPosition).asArray()
      );
    }
  );
});

describe("attachProbeSelection", () => {
  it("attaches the gizmo and replaces the outline selection with the node's meshes", () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;

    attachProbeSelection(gizmoManager, selectionOutlineLayer, probe, node);

    expect(gizmoManager.attachedNode).toBe(node);
    for (const mesh of node.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(true);
    }
  });

  it("clears a prior selection when attaching to a different probe", () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      makeTestSceneWithGizmo();
    const a = makeExperimentWithProbe();
    const b = makeExperimentWithProbe();
    const nodeA = buildProbe(scene, a.probe, a.experiment, gizmoManager)!;
    const nodeB = buildProbe(scene, b.probe, b.experiment, gizmoManager)!;

    attachProbeSelection(gizmoManager, selectionOutlineLayer, a.probe, nodeA);
    attachProbeSelection(gizmoManager, selectionOutlineLayer, b.probe, nodeB);

    for (const mesh of nodeA.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(false);
    }
    for (const mesh of nodeB.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(true);
    }
  });

  it("leaves the gizmo unattached for a locked probe, while still outlining its meshes", () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({ lock: true });
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;

    attachProbeSelection(gizmoManager, selectionOutlineLayer, probe, node);

    expect(gizmoManager.attachedNode).toBeNull();
    for (const mesh of node.getChildMeshes()) {
      expect(selectionOutlineLayer.hasMesh(mesh)).toBe(true);
    }
  });

  it("detaches a prior gizmo when attaching a locked probe after an unlocked one", () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      makeTestSceneWithGizmo();
    const a = makeExperimentWithProbe();
    const b = makeExperimentWithProbe({ lock: true });
    const nodeA = buildProbe(scene, a.probe, a.experiment, gizmoManager)!;
    const nodeB = buildProbe(scene, b.probe, b.experiment, gizmoManager)!;

    attachProbeSelection(gizmoManager, selectionOutlineLayer, a.probe, nodeA);
    attachProbeSelection(gizmoManager, selectionOutlineLayer, b.probe, nodeB);

    expect(gizmoManager.attachedNode).toBeNull();
  });
});

describe("selectProbeFromGizmoAttach", () => {
  it("attaches selection and notifies the callback when a probe mesh is picked", () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;
    const shankMesh = node.getChildMeshes()[0]!;
    const onSelect = vi.fn();

    selectProbeFromGizmoAttach(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      experiment,
      onSelect
    );
    gizmoManager.onAttachedToMeshObservable.notifyObservers(shankMesh);

    expect(gizmoManager.attachedNode).toBe(node);
    expect(onSelect).toHaveBeenCalledWith(probe);
  });

  it("leaves the gizmo unattached for a locked probe's mesh, but still notifies the callback", () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({ lock: true });
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;
    const shankMesh = node.getChildMeshes()[0]!;
    const onSelect = vi.fn();

    selectProbeFromGizmoAttach(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      experiment,
      onSelect
    );
    gizmoManager.onAttachedToMeshObservable.notifyObservers(shankMesh);

    expect(gizmoManager.attachedNode).toBeNull();
    expect(onSelect).toHaveBeenCalledWith(probe);
  });

  it("does nothing when the attached mesh is not a probe mesh", () => {
    const { scene, gizmoManager, selectionOutlineLayer } =
      makeTestSceneWithGizmo();
    const { experiment } = makeExperimentWithProbe();
    const onSelect = vi.fn();
    const unrelatedNode = new TransformNode("unrelated", scene);
    gizmoManager.attachToNode(unrelatedNode);

    selectProbeFromGizmoAttach(
      scene,
      gizmoManager,
      selectionOutlineLayer,
      experiment,
      onSelect
    );
    gizmoManager.onAttachedToMeshObservable.notifyObservers(null);

    expect(onSelect).not.toHaveBeenCalled();
    expect(gizmoManager.attachedNode).toBe(unrelatedNode);
  });
});

describe("setProbePositionFromGizmoDrag", () => {
  it("writes the attached probe's tip position and notifies onDrag", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;
    gizmoManager.attachToNode(node);
    node.position.set(1, 2, 3);
    const onDrag = vi.fn();

    setProbePositionFromGizmoDrag(
      gizmoManager.gizmos.positionGizmo!,
      experiment,
      onDrag
    );
    gizmoManager.gizmos.positionGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(probe.tipPosition).toEqual(vector3ToAsr(node.position));
    expect(onDrag).toHaveBeenCalledWith(probe.id);
  });

  it("does nothing when the attached node is not a probe", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment } = makeExperimentWithProbe();
    const unrelatedNode = new TransformNode("unrelated", scene);
    gizmoManager.attachToNode(unrelatedNode);
    const onDrag = vi.fn();

    setProbePositionFromGizmoDrag(
      gizmoManager.gizmos.positionGizmo!,
      experiment,
      onDrag
    );
    gizmoManager.gizmos.positionGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(onDrag).not.toHaveBeenCalled();
  });
});

describe("setProbeRotationFromGizmoDrag", () => {
  it("writes the attached probe's rotation and notifies onDrag", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;
    gizmoManager.attachToNode(node);
    node.rotation.set(0.1, 0.2, 0.3);
    const onDrag = vi.fn();

    setProbeRotationFromGizmoDrag(
      gizmoManager.gizmos.rotationGizmo!,
      experiment,
      onDrag
    );
    gizmoManager.gizmos.rotationGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );

    expect(probe.rotation).toEqual(vector3ToAsr(node.rotation));
    expect(onDrag).toHaveBeenCalledWith(probe.id);
  });
});

describe("endProbeGizmoDrag", () => {
  /**
   * Regression: a rotation-only drag must clear `draggedProbeId` too, or
   * `syncProbes` permanently skips that probe's transform (the bug behind
   * the gizmo drag ending in an unexpected snap).
   */
  it("fires the callback when a rotation gizmo drag ends, not just a position one", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;
    gizmoManager.attachToNode(node);
    const onDragEnd = vi.fn();

    endProbeGizmoDrag(
      {
        positionGizmo: gizmoManager.gizmos.positionGizmo!,
        rotationGizmo: gizmoManager.gizmos.rotationGizmo!
      },
      onDragEnd
    );
    gizmoManager.gizmos.rotationGizmo!.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );

    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("fires the callback when a position gizmo drag ends", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;
    gizmoManager.attachToNode(node);
    const onDragEnd = vi.fn();

    endProbeGizmoDrag(
      {
        positionGizmo: gizmoManager.gizmos.positionGizmo!,
        rotationGizmo: gizmoManager.gizmos.rotationGizmo!
      },
      onDragEnd
    );
    gizmoManager.gizmos.positionGizmo!.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );

    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("removing every returned observer stops both gizmos from notifying", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;
    gizmoManager.attachToNode(node);
    const onDragEnd = vi.fn();

    const observers = endProbeGizmoDrag(
      {
        positionGizmo: gizmoManager.gizmos.positionGizmo!,
        rotationGizmo: gizmoManager.gizmos.rotationGizmo!
      },
      onDragEnd
    );
    observers.forEach(observer => observer.remove());
    gizmoManager.gizmos.positionGizmo!.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );
    gizmoManager.gizmos.rotationGizmo!.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );

    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it("reproduces the user's sequence: rotate, then drag position, without a snap on release", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(scene, probe, experiment, gizmoManager)!;
    gizmoManager.attachToNode(node);

    let draggedProbeId: string | null = null;
    setProbeRotationFromGizmoDrag(
      gizmoManager.gizmos.rotationGizmo!,
      experiment,
      id => {
        draggedProbeId = id;
      }
    );
    setProbePositionFromGizmoDrag(
      gizmoManager.gizmos.positionGizmo!,
      experiment,
      id => {
        draggedProbeId = id;
      }
    );
    endProbeGizmoDrag(
      {
        positionGizmo: gizmoManager.gizmos.positionGizmo!,
        rotationGizmo: gizmoManager.gizmos.rotationGizmo!
      },
      () => {
        draggedProbeId = null;
      }
    );

    // Rotate, then release. Without watching the rotation gizmo's drag-end,
    // draggedProbeId would stay stuck on this probe forever.
    node.rotation.set(0, 0, Math.PI / 2);
    gizmoManager.gizmos.rotationGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );
    gizmoManager.gizmos.rotationGizmo!.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );
    expect(draggedProbeId).toBeNull();

    // Now drag position, release, and sync: the transform must not snap.
    node.position.set(5, 0, 0);
    gizmoManager.gizmos.positionGizmo!.onDragObservable.notifyObservers(
      {} as DragEvent
    );
    gizmoManager.gizmos.positionGizmo!.onDragEndObservable.notifyObservers(
      {} as DragStartEndEvent
    );
    expect(draggedProbeId).toBeNull();

    const beforeSync = node.position.clone();
    syncProbes(scene, experiment, gizmoManager, draggedProbeId);
    expect(node.position.asArray()).toEqual(beforeSync.asArray());
  });
});
