import { beforeAll, describe, expect, it } from "vitest";
import { Color3, Mesh, StandardMaterial } from "@babylonjs/core";
import type { Experiment } from "@/features/experiment";
import { addProbe, internProbeInterfaceProbe } from "@/features/experiment";
import type { Probe, ProbeGhost } from "@/features/probe";
import { getProbeInterfaceIdentifier } from "@/features/probe";
import {
  makeExperiment,
  makeProbe,
  makeProbeGeometry,
  makeProbeInterfaceProbe
} from "@/test/fixtures";
import {
  initializeTestCSG2,
  makeTestSceneWithGizmo
} from "@/test/mount-helper";
import { buildProbe, getProbeShankMesh } from "./probe.api";
import { toSceneQuaternion, toSceneVector } from "./coordinate-transforms.api";
import {
  getAxisDirections,
  getProbeRestRotation,
  getRotationMatrix,
  multiplyMatrices
} from "@/utils/coordinate-frame";
import { disposeProbeGhost, syncProbeGhost } from "./probe-ghost.api";

/** Single-shank contour, in micrometers - mirrors probe.spec.ts's NP1000. */
const NP1000_CONTOUR = [
  [-11, 9989],
  [-11, -11],
  [24, -220],
  [59, -11],
  [59, 9989]
];

/**
 * Build an experiment with a single interned probe interface definition and
 * a probe referencing it.
 */
function makeExperimentWithProbe(probeOverrides: Partial<Probe> = {}): {
  experiment: Experiment;
  probe: Probe;
} {
  const experiment = makeExperiment();
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

/** Build a fixture ghost pointed at a probe. */
function makeGhost(overrides: Partial<ProbeGhost> = {}): ProbeGhost {
  return {
    probeId: "probe-1",
    tipPosition: [5, 3, 5],
    rotation: [0.1, 0.2, 0.3],
    ...overrides
  };
}

// The head stage is CSG2-subtracted; initialize it once for every test in
// this file, mirroring what probe.spec.ts does.
beforeAll(async () => {
  await initializeTestCSG2();
});

describe("syncProbeGhost", () => {
  it("creates the ghost node under the probe's parent, posed and with unpickable meshes sharing one material", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const probeNode = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    const ghost = makeGhost({ probeId: probe.id });

    syncProbeGhost(
      scene,
      ghost,
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    const ghostNode = scene.getTransformNodeByName("probeGhost_node")!;
    expect(ghostNode).toBeTruthy();
    expect(ghostNode.parent).toBe(probeNode.parent);
    expect(ghostNode.position.asArray()).toEqual(
      toSceneVector(
        getAxisDirections(experiment.globalCoordinateSystem),
        ghost.tipPosition
      ).asArray()
    );
    expect(
      ghostNode.rotationQuaternion!.equalsWithEpsilon(
        toSceneQuaternion(
          multiplyMatrices(
            getRotationMatrix(
              getAxisDirections(experiment.globalCoordinateSystem),
              ghost.rotation
            ),
            getProbeRestRotation(experiment.localCoordinateSystem)
          )
        ),
        1e-6
      )
    ).toBe(true);

    const childMeshes = ghostNode.getChildMeshes();
    expect(childMeshes.length).toBeGreaterThan(0);
    const material = scene.getMaterialByName("probeGhost_material")!;
    for (const mesh of childMeshes) {
      expect(mesh.isPickable).toBe(false);
      expect(mesh.material).toBe(material);
    }
  });

  it("does not shadow the real probe's shank mesh lookup", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());

    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    const shankMesh = getProbeShankMesh(scene, probe.id);
    expect(shankMesh).toBeTruthy();
    expect(shankMesh).toBeInstanceOf(Mesh);
  });

  it("moves the same node on a second call with the same probe id, and replaces it when rebuilt", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());

    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );
    const firstNode = scene.getTransformNodeByName("probeGhost_node")!;

    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id, tipPosition: [1, 2, 3] }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );
    const secondNode = scene.getTransformNodeByName("probeGhost_node")!;

    expect(secondNode.uniqueId).toBe(firstNode.uniqueId);
    expect(secondNode.position.asArray()).toEqual(
      toSceneVector(
        getAxisDirections(experiment.globalCoordinateSystem),
        [1, 2, 3]
      ).asArray()
    );

    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id, tipPosition: [4, 5, 6] }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      [probe.id]
    );
    const thirdNode = scene.getTransformNodeByName("probeGhost_node")!;

    expect(thirdNode.uniqueId).not.toBe(secondNode.uniqueId);
  });

  it("removes any existing ghost and builds nothing when null", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    syncProbeGhost(
      scene,
      null,
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    expect(scene.getTransformNodeByName("probeGhost_node")).toBeNull();
    expect(scene.getMaterialByName("probeGhost_material")).toBeNull();
  });

  it("removes any existing ghost and builds nothing when the probe has no transform node", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    syncProbeGhost(
      scene,
      makeGhost({ probeId: "missing-probe" }),
      [...experiment.probes, makeProbe({ id: "missing-probe" })],
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    expect(scene.getTransformNodeByName("probeGhost_node")).toBeNull();
    expect(scene.getMaterialByName("probeGhost_material")).toBeNull();
  });

  it("colors the ghost material with the probe's own color", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({
      color: "#ff0000"
    });
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());

    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    const material = scene.getMaterialByName("probeGhost_material");
    expect(material).toBeInstanceOf(StandardMaterial);
    expect(
      (material as StandardMaterial).diffuseColor.equals(
        Color3.FromHexString("#ff0000")
      )
    ).toBe(true);
    expect((material as StandardMaterial).alpha).toBe(0.35);
  });

  it("recolors a live ghost when the probe's color changes", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe({
      color: "#ff0000"
    });
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    probe.color = "#00ff00";
    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    const material = scene.getMaterialByName(
      "probeGhost_material"
    ) as StandardMaterial;
    expect(material.diffuseColor.equals(Color3.FromHexString("#00ff00"))).toBe(
      true
    );
  });
});

describe("disposeProbeGhost", () => {
  it("disposes the ghost node, its meshes, and its material", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    buildProbe(scene, probe, experiment, gizmoManager, makeProbeGeometry());
    syncProbeGhost(
      scene,
      makeGhost({ probeId: probe.id }),
      experiment.probes,
      getAxisDirections(experiment.globalCoordinateSystem),
      experiment.localCoordinateSystem,
      []
    );

    disposeProbeGhost(scene);

    expect(scene.getTransformNodeByName("probeGhost_node")).toBeNull();
    expect(scene.getMaterialByName("probeGhost_material")).toBeNull();
    expect(
      scene.meshes.some(mesh => mesh.name.startsWith("probeGhost_node"))
    ).toBe(false);
  });

  it("does nothing when no ghost exists", () => {
    const { scene } = makeTestSceneWithGizmo();

    expect(() => disposeProbeGhost(scene)).not.toThrow();
  });
});
