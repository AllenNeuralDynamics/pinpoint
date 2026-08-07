import { beforeAll, describe, expect, it } from "vitest";
import { GizmoManager } from "@babylonjs/core";
import type { Experiment } from "@/features/experiment";
import {
  addProbe,
  buildExperiment,
  internProbeInterfaceProbe
} from "@/features/experiment";
import type { Probe } from "@/features/probe";
import { getProbeInterfaceIdentifier } from "@/features/probe";
import {
  makeAtlas,
  makeProbe,
  makeProbeGeometry,
  makeProbeInterfaceProbe
} from "@/test/fixtures";
import {
  initializeTestCSG2,
  makeTestScene,
  makeTestSceneWithGizmo
} from "@/test/mount-helper";
import { setGizmoControls } from "./gizmo.api";
import { buildProbe } from "./probe.api";

/** Single-shank contour (imec NP1000), in micrometers. */
const NP1000_CONTOUR = [
  [-11, 9989],
  [-11, -11],
  [8, -217],
  [27, -11],
  [27, 9989]
];

// The head stage is CSG2-subtracted; initialize it once for every test in
// this file, mirroring what `babylon-runtime.service.ts` does at startup.
beforeAll(async () => {
  await initializeTestCSG2();
});

/**
 * Build an experiment with a single interned probe interface definition and
 * a probe referencing it.
 */
function makeExperimentWithProbe(): { experiment: Experiment; probe: Probe } {
  const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
  const probeInterfaceProbe = makeProbeInterfaceProbe({
    probe_planar_contour: NP1000_CONTOUR
  });
  internProbeInterfaceProbe(experiment, probeInterfaceProbe);

  const probe = makeProbe({
    probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe)
  });
  addProbe(experiment, probe);

  return { experiment, probe };
}

describe("setGizmoControls", () => {
  it("enables only the requested transform gizmo", () => {
    const { gizmoManager } = makeTestSceneWithGizmo();

    setGizmoControls(gizmoManager, "position", "local");
    expect(gizmoManager.positionGizmoEnabled).toBe(true);
    expect(gizmoManager.rotationGizmoEnabled).toBe(false);
    expect(gizmoManager.scaleGizmoEnabled).toBe(false);

    setGizmoControls(gizmoManager, "rotation", "local");
    expect(gizmoManager.positionGizmoEnabled).toBe(false);
    expect(gizmoManager.rotationGizmoEnabled).toBe(true);
    expect(gizmoManager.scaleGizmoEnabled).toBe(false);

    setGizmoControls(gizmoManager, "scale", "local");
    expect(gizmoManager.positionGizmoEnabled).toBe(false);
    expect(gizmoManager.rotationGizmoEnabled).toBe(false);
    expect(gizmoManager.scaleGizmoEnabled).toBe(true);
  });

  it("returns the manager's own gizmo instances, unchanged across a mode switch", () => {
    const { gizmoManager } = makeTestSceneWithGizmo();

    const positionMode = setGizmoControls(gizmoManager, "position", "local")!;
    expect(positionMode.positionGizmo).toBe(gizmoManager.gizmos.positionGizmo);
    expect(positionMode.rotationGizmo).toBe(gizmoManager.gizmos.rotationGizmo);
    expect(positionMode.scaleGizmo).toBe(gizmoManager.gizmos.scaleGizmo);

    const rotationMode = setGizmoControls(gizmoManager, "rotation", "local")!;
    expect(rotationMode.positionGizmo).toBe(positionMode.positionGizmo);
    expect(rotationMode.rotationGizmo).toBe(positionMode.rotationGizmo);
    expect(rotationMode.scaleGizmo).toBe(positionMode.scaleGizmo);
  });

  it("keeps the newly enabled gizmo attached to the selected node", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();
    const node = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;

    setGizmoControls(gizmoManager, "position", "local");
    gizmoManager.attachToNode(node);

    const { positionGizmo, rotationGizmo } = setGizmoControls(
      gizmoManager,
      "rotation",
      "local"
    )!;

    expect(rotationGizmo.attachedNode).toBe(node);
    expect(positionGizmo.attachedNode).toBeNull();
  });

  it("global space puts both gizmos on world axes while keeping them on the mesh", () => {
    const { gizmoManager } = makeTestSceneWithGizmo();

    // `PositionGizmo`/`RotationGizmo`'s own `updateGizmoRotationToMatchAttachedMesh`
    // getter does not reflect `coordinatesMode` for every gizmo type (Babylon
    // only keeps the per-axis `xGizmo` in sync), so assert on that instead.
    const global = setGizmoControls(gizmoManager, "position", "global")!;
    expect(
      global.positionGizmo.xGizmo.updateGizmoRotationToMatchAttachedMesh
    ).toBe(false);
    expect(global.positionGizmo.updateGizmoPositionToMatchAttachedMesh).toBe(
      true
    );
    expect(
      global.rotationGizmo.xGizmo.updateGizmoRotationToMatchAttachedMesh
    ).toBe(false);
    expect(global.rotationGizmo.updateGizmoPositionToMatchAttachedMesh).toBe(
      true
    );

    const local = setGizmoControls(gizmoManager, "position", "local")!;
    expect(
      local.positionGizmo.xGizmo.updateGizmoRotationToMatchAttachedMesh
    ).toBe(true);
    expect(local.positionGizmo.updateGizmoPositionToMatchAttachedMesh).toBe(
      true
    );
    expect(
      local.rotationGizmo.xGizmo.updateGizmoRotationToMatchAttachedMesh
    ).toBe(true);
    expect(local.rotationGizmo.updateGizmoPositionToMatchAttachedMesh).toBe(
      true
    );
  });

  it("returns null when neither transform gizmo is enabled", () => {
    const scene = makeTestScene();
    const gizmoManager = new GizmoManager(scene);

    expect(setGizmoControls(gizmoManager, "position", "local")).toBeNull();
  });
});
