import { beforeAll, describe, expect, it } from "vitest";
import { HighlightLayer, Vector3 } from "@babylonjs/core";
import type { Experiment } from "@/features/experiment";
import {
  addProbe,
  buildExperiment,
  internProbeInterfaceProbe
} from "@/features/experiment";
import type { Probe } from "@/features/probe";
import {
  getProbeAlignmentOffsetMillimeters,
  getProbeContour,
  getProbeInterfaceIdentifier,
  getProbeShanks
} from "@/features/probe";
import {
  makeAtlas,
  makeProbe,
  makeProbeGeometry,
  makeProbeInterfaceProbe
} from "@/test/fixtures";
import {
  initializeTestCSG2,
  makeTestSceneWithGizmo,
  makeTestSceneWithPhysics,
  stepPhysics
} from "@/test/mount-helper";
import { buildProbe, disposeProbe, getProbeMeshes } from "./probe.api";
import type { ProbeCollisionChange } from "./probe-collision.api";
import {
  createProbeCollisionState,
  pruneProbeCollisions,
  syncProbeCollisionHighlight,
  trackProbeCollisions
} from "./probe-collision.api";

// The head stage is CSG2-subtracted; initialize it once for every test in this file, mirroring
// what `babylon-runtime.service.ts` does at startup.
beforeAll(async () => {
  await initializeTestCSG2();
});

/** Single-shank contour (imec NP1000), in micrometers - mirrors probe.spec.ts. */
const NP1000_CONTOUR = [
  [-11, 9989],
  [-11, -11],
  [24, -220],
  [59, -11],
  [59, 9989]
];

/** Two 0.1mm shanks 1.8mm apart, joined along a top edge at y = 10mm - mirrors probe.spec.ts. */
const TWO_SHANK_MM_CONTOUR = [
  [-1, 10],
  [-1, 0],
  [-0.9, 0],
  [-0.9, 10],
  [0.9, 10],
  [0.9, 0],
  [1, 0],
  [1, 10]
];

/**
 * Build an experiment with a single interned probe interface definition and a probe referencing
 * it - mirrors probe.spec.ts's helper of the same shape.
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

describe("probe collision bodies", () => {
  it("reports one entered transition, with ids sorted ascending, when two probe bodies start overlapping", async () => {
    const { scene, gizmoManager, havokPlugin } =
      await makeTestSceneWithPhysics();
    const a = makeExperimentWithProbe();
    const b = makeExperimentWithProbe();
    const nodeA = buildProbe(
      scene,
      a.probe,
      a.experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    const nodeB = buildProbe(
      scene,
      b.probe,
      b.experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    nodeA.position = Vector3.Zero();
    nodeB.position = Vector3.Zero();

    const state = createProbeCollisionState();
    const changes: ProbeCollisionChange[] = [];
    trackProbeCollisions(havokPlugin, state, change => changes.push(change));

    for (let step = 0; step < 5; step++) stepPhysics(scene, 1 / 60);

    const [expectedFirst, expectedSecond] = [a.probe.id, b.probe.id].sort();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      kind: "entered",
      probeIds: [expectedFirst, expectedSecond]
    });
  });

  it("highlights both probes' meshes while overlapping, then un-highlights and reports exited once separated", async () => {
    const { scene, gizmoManager, havokPlugin } =
      await makeTestSceneWithPhysics();
    const highlightLayer = new HighlightLayer("test_highlight_layer", scene);
    const a = makeExperimentWithProbe();
    const b = makeExperimentWithProbe();
    const nodeA = buildProbe(
      scene,
      a.probe,
      a.experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    const nodeB = buildProbe(
      scene,
      b.probe,
      b.experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    nodeA.position = Vector3.Zero();
    nodeB.position = Vector3.Zero();

    const state = createProbeCollisionState();
    trackProbeCollisions(havokPlugin, state, change => {
      for (const probeId of change.probeIds) {
        syncProbeCollisionHighlight(
          highlightLayer,
          state,
          probeId,
          getProbeMeshes(scene, probeId)
        );
      }
    });

    for (let step = 0; step < 5; step++) stepPhysics(scene, 1 / 60);

    const meshesA = getProbeMeshes(scene, a.probe.id);
    const meshesB = getProbeMeshes(scene, b.probe.id);
    expect(meshesA).not.toHaveLength(0);
    expect(meshesB).not.toHaveLength(0);
    for (const mesh of [...meshesA, ...meshesB]) {
      expect(highlightLayer.hasMesh(mesh)).toBe(true);
    }

    nodeB.position = new Vector3(1000, 0, 0);
    for (let step = 0; step < 5; step++) stepPhysics(scene, 1 / 60);

    for (const mesh of [...meshesA, ...meshesB]) {
      expect(highlightLayer.hasMesh(mesh)).toBe(false);
    }
  });

  it("drops a pruned probe's overlap and un-highlights the surviving probe", async () => {
    const { scene, gizmoManager, havokPlugin } =
      await makeTestSceneWithPhysics();
    const highlightLayer = new HighlightLayer("test_highlight_layer", scene);
    const a = makeExperimentWithProbe();
    const b = makeExperimentWithProbe();
    const nodeA = buildProbe(
      scene,
      a.probe,
      a.experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    const nodeB = buildProbe(
      scene,
      b.probe,
      b.experiment,
      gizmoManager,
      makeProbeGeometry()
    )!;
    nodeA.position = Vector3.Zero();
    nodeB.position = Vector3.Zero();

    const state = createProbeCollisionState();
    trackProbeCollisions(havokPlugin, state, change => {
      for (const probeId of change.probeIds) {
        syncProbeCollisionHighlight(
          highlightLayer,
          state,
          probeId,
          getProbeMeshes(scene, probeId)
        );
      }
    });

    for (let step = 0; step < 5; step++) stepPhysics(scene, 1 / 60);

    const meshesB = getProbeMeshes(scene, b.probe.id);
    expect(highlightLayer.hasMesh(meshesB[0]!)).toBe(true);

    // Disposing a body while it overlaps emits no TRIGGER_EXITED, so the pair count would leak
    // without an explicit prune.
    disposeProbe(scene, a.probe.id, gizmoManager);
    const affected = pruneProbeCollisions(state, [b.probe.id]);
    expect(affected).toEqual([b.probe.id]);

    for (const probeId of affected) {
      syncProbeCollisionHighlight(
        highlightLayer,
        state,
        probeId,
        getProbeMeshes(scene, probeId)
      );
    }
    for (const mesh of meshesB) {
      expect(highlightLayer.hasMesh(mesh)).toBe(false);
    }
  });

  it("offsets the body's world bounds by the shank alignment offset, matching an unaligned build", async () => {
    const { scene, gizmoManager } = await makeTestSceneWithPhysics();
    const probeInterfaceOverrides: Partial<
      Parameters<typeof makeProbeInterfaceProbe>[0]
    > = {
      si_units: "mm",
      probe_planar_contour: TWO_SHANK_MM_CONTOUR,
      contact_positions: [
        [-0.95, 1],
        [0.95, 1]
      ],
      shank_ids: ["0", "1"],
      contact_shapes: ["square", "square"],
      contact_shape_params: [{ width: 0.02 }, { width: 0.02 }]
    };
    const centered = makeExperimentWithProbe({}, probeInterfaceOverrides);
    const aligned = makeExperimentWithProbe(
      { shankAlignmentIndex: 0 },
      probeInterfaceOverrides
    );

    buildProbe(
      scene,
      centered.probe,
      centered.experiment,
      gizmoManager,
      makeProbeGeometry()
    );
    buildProbe(
      scene,
      aligned.probe,
      aligned.experiment,
      gizmoManager,
      makeProbeGeometry()
    );
    stepPhysics(scene, 1 / 60);

    const bodyCentered = scene.getTransformNodeByName(
      `${centered.probe.id}_probe_collider`
    )!.physicsBody!;
    const bodyAligned = scene.getTransformNodeByName(
      `${aligned.probe.id}_probe_collider`
    )!.physicsBody!;

    const contour = getProbeContour(
      makeProbeInterfaceProbe(probeInterfaceOverrides)
    )!;
    const expectedOffset = getProbeAlignmentOffsetMillimeters(
      getProbeShanks(makeProbeInterfaceProbe(probeInterfaceOverrides), contour),
      0
    );

    const centeredBounds = bodyCentered.getBoundingBox();
    const alignedBounds = bodyAligned.getBoundingBox();
    expect(
      alignedBounds.minimumWorld.x - centeredBounds.minimumWorld.x
    ).toBeCloseTo(expectedOffset, 3);
    expect(
      alignedBounds.maximumWorld.x - centeredBounds.maximumWorld.x
    ).toBeCloseTo(expectedOffset, 3);
  });

  it("builds a transform node but no collider when the scene has no physics engine", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const { experiment, probe } = makeExperimentWithProbe();

    const node = buildProbe(
      scene,
      probe,
      experiment,
      gizmoManager,
      makeProbeGeometry()
    );

    expect(node).not.toBeNull();
    expect(scene.getTransformNodeByName(`${probe.id}_probe_collider`)).toBe(
      null
    );
  });
});
