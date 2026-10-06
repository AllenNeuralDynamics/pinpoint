import { beforeAll, describe, expect, it } from "vitest";
import { MeshBuilder, Vector3 } from "@babylonjs/core";
import {
  buildCoordinateSystemNode,
  buildCoordinateSystem,
  buildCoordinateSystemValue,
  solveCoordinateSystemChain,
  solveCoordinateSystemChainInverse,
  SETTLED_SOLVE_STARTS,
  type CoordinateSystemNode,
  type CoordinateSystem
} from "@/features/coordinate-system";
import {
  buildExperiment,
  internProbeInterfaceProbe,
  setProbeCoordinateSystem,
  updateInternedCoordinateSystem
} from "@/features/experiment";
import {
  makeAtlas,
  makeProbe,
  makeProbeGeometry,
  makeProbeInterfaceProbe
} from "@/test/fixtures";
import {
  initializeTestCSG2,
  makeTestSceneWithGizmo
} from "@/test/mount-helper";
import { getProbeTransformNode, syncProbes } from "./probe.api";
import {
  buildAtlasRootNode,
  buildSceneWorldRootNode,
  setAtlasBrainTransform,
  setAtlasCenterOffset
} from "./structures.api";
import { syncCoordinateSystemGimbals } from "./coordinate-system-gimbal.api";
import { syncProbeSurfaceMarker } from "./probe-surface-marker.api";

type Triple = [number, number, number];

const CORNERS: Triple[] = [-0.2, 0.2].flatMap(x =>
  [-0.1, 0.1].flatMap(y => [0, 4].map(z => [x, y, z] as Triple))
);
const REFERENCE: Triple = [3, 5, 7];
const CENTER: Triple = [6, 8, 10];

beforeAll(initializeTestCSG2);

/**
 * Build a transform with explicit XYZ translations and pitch/yaw/roll angles.
 * @param position Translation in the parent frame.
 * @param rotation Angles in radians.
 */
function node(position: Triple, rotation: Triple): CoordinateSystemNode {
  return buildCoordinateSystemNode(
    "Transform",
    position.map(value =>
      buildCoordinateSystemValue("", value)
    ) as CoordinateSystemNode["position"],
    rotation.map(value =>
      buildCoordinateSystemValue("", value)
    ) as CoordinateSystemNode["rotation"]
  );
}

/**
 * Apply a chain using scalar trigonometry, independently of the solver and Babylon matrices.
 * @param point Local XYZ point.
 * @param chain Parent-first transforms.
 * @param reference Optional ASR reference origin.
 */
function expectedPoint(
  point: Triple,
  chain: CoordinateSystemNode[],
  reference: Triple | null = REFERENCE
): Triple {
  let [x, y, z] = point;
  for (const transform of chain.toReversed()) {
    const [pitch, yaw, roll] = transform.rotation.map(
      ({ value }) => value
    ) as Triple;
    [x, y] = [
      Math.cos(roll) * x - Math.sin(roll) * y,
      Math.sin(roll) * x + Math.cos(roll) * y
    ];
    [y, z] = [
      Math.cos(pitch) * y - Math.sin(pitch) * z,
      Math.sin(pitch) * y + Math.cos(pitch) * z
    ];
    [x, z] = [
      Math.cos(yaw) * x + Math.sin(yaw) * z,
      -Math.sin(yaw) * x + Math.cos(yaw) * z
    ];
    x += transform.position[0].value;
    y += transform.position[1].value;
    z += transform.position[2].value;
  }
  const [ap, dv, ml] = reference ?? [0, 0, 0];
  return [x + ml, y + dv, z + ap];
}

/**
 * Check every corner of a tip-anchored rectangular probe through the real scene pose sync.
 * @param chain Chain whose forward solution drives the probe.
 * @param expected Independently calculated XYZ corner positions in atlas space.
 * @param brainSystem Optional fixed root defining the display frame.
 */
function expectRenderedCorners(
  chain: CoordinateSystemNode[],
  expected: Triple[],
  brainSystem: CoordinateSystem | null = null
) {
  const { scene, gizmoManager, selectionOutlineLayer } =
    makeTestSceneWithGizmo();
  setAtlasCenterOffset(scene, CENTER);
  setAtlasBrainTransform(scene, brainSystem, REFERENCE);
  const experiment = buildExperiment("Box geometry", makeAtlas(), REFERENCE);
  const definition = makeProbeInterfaceProbe({
    probe_planar_contour: [
      [-200, 0],
      [200, 0],
      [200, 4000],
      [-200, 4000]
    ]
  });
  internProbeInterfaceProbe(experiment, definition);
  const reference =
    brainSystem?.offsetByReferenceCoordinate === false ? null : REFERENCE;
  const solution = solveCoordinateSystemChain(chain, reference);
  const probe = makeProbe({
    tipPosition: solution.tipPosition,
    rotation: solution.rotation
  });
  experiment.probes.push(probe);
  syncProbes(scene, experiment, gizmoManager, null, makeProbeGeometry(), true);
  const box = MeshBuilder.CreateBox(
    "rectangular-probe",
    { width: 0.4, height: 0.2, depth: 4 },
    scene
  );
  box.parent = getProbeTransformNode(scene, probe.id)!;
  expect(box.parent).not.toBeNull();
  box.position.z = 2;
  syncCoordinateSystemGimbals(
    scene,
    selectionOutlineLayer,
    brainSystem ?? buildCoordinateSystem("Preview", chain, true),
    REFERENCE,
    15,
    null,
    makeProbeGeometry()
  );
  const gimbal = scene.getTransformNodeByName(
    `coordinateSystemGimbal_${chain.length - 1}_node`
  )!;
  for (const [index, [x, y, z]] of CORNERS.entries()) {
    const actual = Vector3.TransformCoordinates(
      new Vector3(x, y, z - 2),
      box.computeWorldMatrix(true)
    );
    const [ex, ey, ez] = expected[index]!;
    expect(actual.x, `corner ${index} X`).toBeCloseTo(ex - CENTER[2], 5);
    expect(actual.y, `corner ${index} Y`).toBeCloseTo(CENTER[1] - ey, 5);
    expect(actual.z, `corner ${index} Z`).toBeCloseTo(CENTER[0] - ez, 5);
    const previewCorner = Vector3.TransformCoordinates(
      new Vector3(x, y, z),
      gimbal.computeWorldMatrix(true)
    );
    expect(
      previewCorner.equalsWithEpsilon(actual, 1e-5),
      `preview corner ${index}`
    ).toBe(true);
    const nativeCorner = Vector3.TransformCoordinates(
      actual,
      buildAtlasRootNode(scene).computeWorldMatrix(true).clone().invert()
    );
    const expectedNative = expectedPoint([x, y, z], chain, reference);
    nativeCorner
      .asArray()
      .forEach((value, axis) =>
        expect(value, `native corner ${index}, axis ${axis}`).toBeCloseTo(
          expectedNative[axis]!,
          4
        )
      );
  }
  return { scene, gizmoManager, selectionOutlineLayer, experiment, probe, box };
}

describe("rectangular probe transform-chain geometry", () => {
  const cases = [
    { name: "identity", chain: [node([0, 0, 0], [0, 0, 0])] },
    { name: "translation", chain: [node([2, -3, 4], [0, 0, 0])] },
    {
      name: "15 degree pitch at a translated tip",
      chain: [node([2, -3, 4], [Math.PI / 12, 0, 0])]
    },
    {
      name: "combined tip rotation",
      chain: [node([2, -3, 4], [0.4, -0.6, 0.3])]
    },
    {
      name: "surface coordinate and depth",
      chain: [node([2, -3, 4], [0.4, -0.6, 0.3]), node([0, 0, -2], [0, 0, 0])]
    },
    {
      name: "arc, module, stage, and depth",
      chain: [
        node([0, 0, 0], [0.4, 0, 0]),
        node([0, 0, 0], [0, -0.6, 0]),
        node([2, -3, 4], [0, 0, 0]),
        node([0, 0, -2], [0, 0, 0.3])
      ]
    }
  ];

  it.each(cases)("places all eight corners for $name", ({ chain }) => {
    expectRenderedCorners(
      chain,
      CORNERS.map(corner => expectedPoint(corner, chain))
    );
  });

  it.each(cases)(
    "keeps $name unchanged in the display frame with an additional fixed 15 degree pitch in atlas space",
    ({ chain }) => {
      const root = node([0, 0, 0], [Math.PI / 12, 0, 0]);
      const system = buildCoordinateSystem(
        "Tilted brain",
        [root, ...chain],
        true,
        true
      );
      expectRenderedCorners(
        system.chain,
        CORNERS.map(corner => expectedPoint(corner, chain)),
        system
      );
    }
  );

  it.each([false, true])(
    "uses only the configured reference origin (reference enabled: %s)",
    offsetByReferenceCoordinate => {
      const root = node([1, -2, 3], [Math.PI / 12, 0.2, -0.3]);
      const downstream = [node([2, -3, 4], [0.4, -0.6, 0.3])];
      const system = buildCoordinateSystem(
        "Root frame",
        [root, ...downstream],
        offsetByReferenceCoordinate,
        true
      );
      const reference = offsetByReferenceCoordinate ? REFERENCE : null;
      const { scene } = expectRenderedCorners(
        system.chain,
        CORNERS.map(corner => expectedPoint(corner, downstream, reference)),
        system
      );
      const worldFrame = buildSceneWorldRootNode(scene)
        .computeWorldMatrix(true)
        .clone();
      root.rotation[0].value += 0.5;
      setAtlasBrainTransform(scene, system, REFERENCE);
      expect(
        buildSceneWorldRootNode(scene).computeWorldMatrix(true).asArray()
      ).toEqual(worldFrame.asArray());
      setAtlasBrainTransform(scene, null, REFERENCE);
      expect(
        buildAtlasRootNode(scene)
          .computeWorldMatrix(true)
          .equalsWithEpsilon(worldFrame, 1e-5)
      ).toBe(true);
    }
  );

  it.each([0, Math.PI / 12])(
    "keeps surface yaw and roll canonical when editing away from vertical pitch (root: %s)",
    pitch => {
      const root = node([0, 0, 0], [pitch, 0, 0]);
      for (const value of [...root.position, ...root.rotation])
        value.mode = "fixed";
      const surface = node([2, -3, 4], [Math.PI / 2, 0, 0]);
      surface.onSurface = true;
      const depth = node([0, 0, -5], [0, 0, 0]);
      for (const value of [...depth.position.slice(0, 2), ...depth.rotation])
        value.mode = "fixed";
      const chain = [root, surface, depth];
      const goal = solveCoordinateSystemChain(chain, REFERENCE);
      const [ml, dv, ap] = expectedPoint([0, 0, 0], [root, surface]);
      for (const value of [
        ...surface.position,
        ...surface.rotation,
        depth.position[2]
      ])
        value.value = 0;
      expect(
        solveCoordinateSystemChainInverse(
          chain,
          { ...goal, surfacePosition: [ap, dv, ml] },
          REFERENCE,
          SETTLED_SOLVE_STARTS
        )
      ).toBe("converged");
      expect(surface.rotation[1].value).toBeCloseTo(0, 4);
      expect(surface.rotation[2].value).toBeCloseTo(0, 4);
      surface.rotation[0].value = (75 * Math.PI) / 180;
      const expectedSurface = node([2, -3, 4], [(75 * Math.PI) / 180, 0, 0]);
      const expectedDepth = node([0, 0, -5], [0, 0, 0]);
      const system = buildCoordinateSystem("Tilted surface", chain, true, true);
      expectRenderedCorners(
        chain,
        CORNERS.map(corner =>
          expectedPoint(corner, [expectedSurface, expectedDepth])
        ),
        system
      );
    }
  );

  it("keeps the entire brain fixed as downstream translation, pitch, yaw, roll, and depth change", () => {
    const root = node([1, -2, 3], [Math.PI / 12, -0.2, 0.3]);
    const downstream = [
      node([2, -3, 4], [0.4, -0.6, 0.3]),
      node([0, 0, -2], [0, 0, 0])
    ];
    const system = buildCoordinateSystem(
      "Fixed frame",
      [root, ...downstream],
      true,
      true
    );
    const { scene, probe, experiment, gizmoManager, box } =
      expectRenderedCorners(
        system.chain,
        CORNERS.map(corner => expectedPoint(corner, downstream)),
        system
      );
    const brainMatrix = buildAtlasRootNode(scene)
      .computeWorldMatrix(true)
      .clone();
    for (const [position, rotation, depth] of [
      [[8, 7, 6], [0.1, 0.2, 0.3], -3],
      [[1, 2, 3], [-0.4, 0.7, -0.2], -5],
      [[-1, -2, -3], [0.8, -0.3, 0.5], 1]
    ] as [Triple, Triple, number][]) {
      downstream[0]!.position.forEach(
        (entry, axis) => (entry.value = position[axis]!)
      );
      downstream[0]!.rotation.forEach(
        (entry, axis) => (entry.value = rotation[axis]!)
      );
      downstream[1]!.position[2].value = depth;
      const solution = solveCoordinateSystemChain(system.chain, REFERENCE);
      probe.tipPosition = solution.tipPosition;
      probe.rotation = solution.rotation;
      syncProbes(
        scene,
        experiment,
        gizmoManager,
        null,
        makeProbeGeometry(),
        true
      );
      setAtlasBrainTransform(scene, system, REFERENCE);
      expect(
        buildAtlasRootNode(scene).computeWorldMatrix(true).asArray()
      ).toEqual(brainMatrix.asArray());
      for (const [x, y, z] of CORNERS) {
        const actual = Vector3.TransformCoordinates(
          new Vector3(x, y, z - 2),
          box.computeWorldMatrix(true)
        );
        const [ex, ey, ez] = expectedPoint([x, y, z], downstream);
        expect(
          actual.equalsWithEpsilon(
            new Vector3(ex - CENTER[2], CENTER[1] - ey, CENTER[0] - ez),
            1e-5
          )
        ).toBe(true);
      }
    }
  });

  it("preserves all eight displayed corners when selecting, editing, and removing a brain root without an animation jump", () => {
    const downstream = [node([2, -3, 4], [0.4, -0.6, 0.3])];
    const { scene, probe, experiment, gizmoManager, box } =
      expectRenderedCorners(
        downstream,
        CORNERS.map(corner => expectedPoint(corner, downstream))
      );
    const initialCorners = CORNERS.map(([x, y, z]) =>
      Vector3.TransformCoordinates(
        new Vector3(x, y, z - 2),
        box.computeWorldMatrix(true)
      )
    );
    const root = node([0, 0, 0], [Math.PI / 12, 0, 0]);
    const system = buildCoordinateSystem(
      "Tilted brain",
      [root, ...downstream],
      true,
      true
    );
    setProbeCoordinateSystem(experiment, probe, system);
    for (const pitch of [Math.PI / 12, Math.PI / 6, -Math.PI / 12]) {
      root.rotation[0].value = pitch;
      updateInternedCoordinateSystem(experiment, system);
      setAtlasBrainTransform(scene, system, REFERENCE);
      syncProbes(scene, experiment, gizmoManager, null, makeProbeGeometry());
      for (const [index, [x, y, z]] of CORNERS.entries()) {
        const actual = Vector3.TransformCoordinates(
          new Vector3(x, y, z - 2),
          box.computeWorldMatrix(true)
        );
        expect(actual.equalsWithEpsilon(initialCorners[index]!, 1e-5)).toBe(
          true
        );
        const inBrain = Vector3.TransformCoordinates(
          actual,
          buildAtlasRootNode(scene).computeWorldMatrix(true).clone().invert()
        );
        expect(
          inBrain.equalsWithEpsilon(
            Vector3.FromArray(expectedPoint([x, y, z], system.chain)),
            1e-5
          )
        ).toBe(true);
      }
    }
    setProbeCoordinateSystem(experiment, probe, null);
    setAtlasBrainTransform(scene, null, REFERENCE);
    syncProbes(scene, experiment, gizmoManager, null, makeProbeGeometry());
    for (const [index, [x, y, z]] of CORNERS.entries()) {
      expect(
        Vector3.TransformCoordinates(
          new Vector3(x, y, z - 2),
          box.computeWorldMatrix(true)
        ).equalsWithEpsilon(initialCorners[index]!, 1e-5)
      ).toBe(true);
    }
  });

  it.each([0, Math.PI / 12])(
    "recovers surface coordinate and depth with a fixed %s radian root",
    pitch => {
      const root = node([1, 2, -1], [pitch, 0, 0]);
      for (const value of [...root.position, ...root.rotation])
        value.mode = "fixed";
      const surface = node([2, -3, 4], [0.4, -0.6, 0.3]);
      surface.onSurface = true;
      const depth = node([0, 0, -2], [0, 0, 0]);
      for (const value of [...depth.position.slice(0, 2), ...depth.rotation])
        value.mode = "fixed";
      const chain = [root, surface, depth];
      const expected = CORNERS.map(corner => expectedPoint(corner, chain));
      const displayedCorners = CORNERS.map(corner =>
        expectedPoint(corner, [surface, depth])
      );
      const displayedSurface = expectedPoint([0, 0, 0], [surface]);
      const target = solveCoordinateSystemChain(chain, REFERENCE);
      const [ml, dv, ap] = expectedPoint([0, 0, 0], [root, surface]);
      for (const transform of chain) {
        for (const value of [...transform.position, ...transform.rotation]) {
          if (value.mode === "free") value.value = 0;
        }
      }
      const status = solveCoordinateSystemChainInverse(
        chain,
        {
          ...target,
          surfacePosition: [ap, dv, ml]
        },
        REFERENCE,
        SETTLED_SOLVE_STARTS
      );
      expect(status).toBe("converged");
      expect(depth.position[2].value).toBeCloseTo(-2, 4);
      expectRenderedCorners(chain, expected);
      const system = buildCoordinateSystem(
        "Surface with fixed root",
        chain,
        true,
        true
      );
      const { scene, selectionOutlineLayer, probe } = expectRenderedCorners(
        chain,
        displayedCorners,
        system
      );
      syncProbeSurfaceMarker(
        scene,
        selectionOutlineLayer,
        { probeId: probe.id, position: [ap, dv, ml] },
        [probe],
        0.1
      );
      const marker = scene.getMeshByName("probeSurfaceMarker_mesh")!;
      const [x, y, z] = displayedSurface;
      expect(
        marker
          .computeWorldMatrix(true)
          .getTranslation()
          .equalsWithEpsilon(
            new Vector3(x - CENTER[2], CENTER[1] - y, CENTER[0] - z),
            1e-5
          )
      ).toBe(true);
    }
  );
});
