import { beforeAll, describe, expect, it } from "vitest";
import type { StandardMaterial } from "@babylonjs/core";
import {
  Color3,
  Matrix,
  MeshBuilder,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import {
  buildCoordinateSystem,
  buildCoordinateSystemNode,
  buildCoordinateSystemValue,
  solveCoordinateSystemChain,
  type CoordinateSystemNode
} from "@/features/coordinate-system";
import {
  initializeTestCSG2,
  makeTestSceneWithGizmo
} from "@/test/mount-helper";
import { makeProbeGeometry } from "@/test/fixtures";
import type {
  AxisDirections,
  LocalCoordinateSystem
} from "@/utils/coordinate-frame";
import {
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  getAxisDirections,
  getChainRestRotation,
  getProbeRestRotation,
  getRotationMatrix,
  multiplyMatrices
} from "@/utils/coordinate-frame";
import { toSceneQuaternion, toSceneVector } from "./coordinate-transforms.api";
import { LOCAL_FRAME_AXIS_COLORS } from "./frame-axes.api";
import { buildAtlasRootNode } from "./structures.api";
import { syncCoordinateSystemGimbals } from "./coordinate-system-gimbal.api";

/** Atlas longest-dimension stand-in for every test: an axis length of 18mm. */
const ATLAS_SCALE_MILLIMETERS = 100;

/** Axis directions new experiments start in: x right, y anterior, z superior. */
const RAS_DIRECTIONS: AxisDirections = getAxisDirections(
  buildDefaultGlobalCoordinateSystem()
);

/** Resting orientation new experiments start in: depth posterior, electrodes up. */
const REST = buildDefaultLocalCoordinateSystem();

/** A rest orientation aimed straight down, as a stereotaxic probe sits. */
const DOWNWARD_REST: LocalCoordinateSystem = {
  depthDirection: "Superior_to_inferior",
  forwardDirection: "Posterior_to_anterior"
};

// The chain-tip marker's head stage is CSG2-subtracted; initialize it once for every test in
// this file, mirroring what `babylon-runtime.service.ts` does at startup.
beforeAll(async () => {
  await initializeTestCSG2();
});

/**
 * Assert two Babylon vectors are componentwise close, tolerating float
 * error from chained transforms.
 * @param actual Vector produced by the code under test.
 * @param expected Vector to compare against.
 */
function expectVectorCloseTo(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number }
): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.z).toBeCloseTo(expected.z);
}

/**
 * Build a fixture chain node with explicit position and rotation values, all
 * mapped to their identity display order.
 * @param name Display name of the node.
 * @param position Position values as [X, Y, Z].
 * @param rotation Rotation values as [Pitch, Yaw, Roll].
 */
function makeNode(
  name: string,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0]
): CoordinateSystemNode {
  return buildCoordinateSystemNode(
    name,
    [
      buildCoordinateSystemValue("X", position[0]),
      buildCoordinateSystemValue("Y", position[1]),
      buildCoordinateSystemValue("Z", position[2])
    ],
    [
      buildCoordinateSystemValue("Pitch", rotation[0]),
      buildCoordinateSystemValue("Yaw", rotation[1]),
      buildCoordinateSystemValue("Roll", rotation[2])
    ]
  );
}

describe("syncCoordinateSystemGimbals", () => {
  it("places each chain node's gimbal at the solver's solved position", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();
    const chain = [
      makeNode("Parent", [0, 0, 0], [0, Math.PI / 6, 0]),
      makeNode("Child", [1, 2, 3])
    ];
    const solution = solveCoordinateSystemChain(
      chain,
      null,
      RAS_DIRECTIONS,
      REST
    );

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", chain),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    const atlasRoot = buildAtlasRootNode(scene);
    const childGimbal = scene.getTransformNodeByName(
      "coordinateSystemGimbal_1_node"
    )!;
    const expectedWorldPosition = Vector3.TransformCoordinates(
      toSceneVector(RAS_DIRECTIONS, solution.nodePositions[1]!),
      atlasRoot.computeWorldMatrix(true)
    );
    expectVectorCloseTo(
      childGimbal.computeWorldMatrix(true).getTranslation(),
      expectedWorldPosition
    );
  });

  it("roots the chain in the probe's resting chain orientation, so a depth value drives it deeper", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();
    // The chain's third axis is the depth axis, so a Z value is a depth value.
    const chain = [makeNode("Depth", [0, 0, 5])];
    const solution = solveCoordinateSystemChain(
      chain,
      null,
      RAS_DIRECTIONS,
      DOWNWARD_REST
    );

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", chain),
      [0, 0, 0],
      RAS_DIRECTIONS,
      DOWNWARD_REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    const rest = scene.getTransformNodeByName(
      "coordinateSystemGimbalRest_node"
    )!;
    expect(
      rest.rotationQuaternion!.equalsWithEpsilon(
        toSceneQuaternion(getChainRestRotation(DOWNWARD_REST))
      )
    ).toBe(true);

    // Depth 5mm down means 5mm inferior, which the solver reports as -5 on the
    // superior axis of a RAS system.
    expect(solution.tipPosition[2]).toBeCloseTo(-5);
    const atlasRoot = buildAtlasRootNode(scene);
    const gimbal = scene.getTransformNodeByName(
      "coordinateSystemGimbal_0_node"
    )!;
    expectVectorCloseTo(
      gimbal.computeWorldMatrix(true).getTranslation(),
      Vector3.TransformCoordinates(
        toSceneVector(RAS_DIRECTIONS, solution.nodePositions[0]!),
        atlasRoot.computeWorldMatrix(true)
      )
    );
  });

  it("builds the NP1000 shank standing tip-first with the head stage beyond it", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();
    const chain = [makeNode("Parent", [0, 0, 0], [0, Math.PI / 5, 0])];
    const geometry = makeProbeGeometry();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", chain),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      geometry
    );

    const shank = scene.getMeshByName("coordinateSystemGimbalPose_mesh")!;
    const shankBounds = shank.getBoundingInfo().boundingBox;
    expect(shankBounds.minimum.z).toBeCloseTo(0);
    expect(shankBounds.maximum.z).toBeCloseTo(10.209);
    expect(shankBounds.minimum.x).toBeCloseTo(-0.035);
    expect(shankBounds.maximum.x).toBeCloseTo(0.035);

    const headStage = scene.getMeshByName(
      "coordinateSystemGimbalPoseHeadStage_mesh"
    )!;
    expect(headStage.position.z).toBeCloseTo(
      10.209 + geometry.headStageLengthMillimeters / 2
    );
  });

  it.each([
    { label: "the default rest", localCoordinateSystem: REST },
    { label: "a downward rest", localCoordinateSystem: DOWNWARD_REST }
  ])(
    "orients the chain-tip probe marker exactly like a real probe at the solved pose, for $label",
    ({ localCoordinateSystem }) => {
      const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();
      const chain = [
        makeNode("Arm", [0, 0, 0], [Math.PI / 7, Math.PI / 5, 0]),
        makeNode("Depth", [0, 0, 3])
      ];
      const solution = solveCoordinateSystemChain(
        chain,
        null,
        RAS_DIRECTIONS,
        localCoordinateSystem
      );

      syncCoordinateSystemGimbals(
        scene,
        selectionOutlineLayer,
        buildCoordinateSystem("Fixture", chain),
        [0, 0, 0],
        RAS_DIRECTIONS,
        localCoordinateSystem,
        ATLAS_SCALE_MILLIMETERS,
        null,
        makeProbeGeometry()
      );

      // The orientation a real probe's node carries: its solved rest-relative
      // rotation composed onto the resting body orientation.
      const reference = new TransformNode("referenceProbe", scene);
      reference.parent = buildAtlasRootNode(scene);
      reference.rotationQuaternion = toSceneQuaternion(
        multiplyMatrices(
          getRotationMatrix(RAS_DIRECTIONS, solution.rotation),
          getProbeRestRotation(localCoordinateSystem)
        )
      );

      const pose = scene.getTransformNodeByName(
        "coordinateSystemGimbalPose_node"
      )!;
      const referenceMatrix = reference.computeWorldMatrix(true);
      const poseMatrix = pose.computeWorldMatrix(true);
      for (const axis of [
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 0, 1)
      ]) {
        expectVectorCloseTo(
          Vector3.TransformNormal(axis, poseMatrix).normalize(),
          Vector3.TransformNormal(axis, referenceMatrix).normalize()
        );
      }
    }
  );

  it("colours the probe marker's shank and head stage with the shared pink lit material", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    const shank = scene.getMeshByName("coordinateSystemGimbalPose_mesh")!;
    const headStage = scene.getMeshByName(
      "coordinateSystemGimbalPoseHeadStage_mesh"
    )!;
    const material = scene.getMaterialByName(
      "coordinateSystemGimbalPose_material"
    ) as StandardMaterial;

    expect(shank.material).toBe(material);
    expect(headStage.material).toBe(material);
    expect(material.diffuseColor.equals(Color3.FromHexString("#e91e63"))).toBe(
      true
    );
    expect(material.disableLighting).toBe(false);
  });

  it("cuts the head-stage notch on the shank's -Y (contact) face", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    const headStage = scene.getMeshByName(
      "coordinateSystemGimbalPoseHeadStage_mesh"
    )!;
    const positions = headStage.getVerticesData("position")!;
    const ys: number[] = [];
    for (let i = 1; i < positions.length; i += 3) ys.push(positions[i]!);

    expect(
      ys.filter(y => Math.abs(y - -0.025) < 1e-6).length
    ).toBeGreaterThanOrEqual(3);
    expect(ys.some(y => Math.abs(y - 0.025) < 1e-6)).toBe(false);
  });

  it("cuts the head stage template once per geometry, not once per sync", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();
    const geometry = makeProbeGeometry();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      geometry
    );
    const firstTemplate = scene.getMeshByName(
      "coordinateSystemGimbalPoseHeadStageTemplate_mesh"
    )!;

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      geometry
    );
    const secondTemplate = scene.getMeshByName(
      "coordinateSystemGimbalPoseHeadStageTemplate_mesh"
    )!;
    expect(secondTemplate).toBe(firstTemplate);

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      {
        ...geometry,
        headStageLengthMillimeters: geometry.headStageLengthMillimeters + 5
      }
    );
    const thirdTemplate = scene.getMeshByName(
      "coordinateSystemGimbalPoseHeadStageTemplate_mesh"
    )!;
    expect(thirdTemplate).not.toBe(secondTemplate);
  });

  it("composes pitch and yaw together, not a single-axis approximation of either", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();
    const pitch = Math.PI / 6;
    const yaw = Math.PI / 4;
    const chain = [makeNode("Node", [0, 0, 0], [pitch, yaw, 0])];

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", chain),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    // Measured against the rest node, whose frame the chain's first node turns in.
    const rest = scene.getTransformNodeByName(
      "coordinateSystemGimbalRest_node"
    )!;
    const gimbal = scene.getTransformNodeByName(
      "coordinateSystemGimbal_0_node"
    )!;
    const chainLocalDirection = new Vector3(1, 0, 0);
    const expectedDirection = Vector3.TransformNormal(
      Vector3.TransformNormal(
        chainLocalDirection,
        Matrix.RotationYawPitchRoll(yaw, pitch, 0)
      ),
      rest.computeWorldMatrix(true)
    );
    const actualDirection = Vector3.TransformNormal(
      chainLocalDirection,
      gimbal.computeWorldMatrix(true)
    );
    expectVectorCloseTo(actualDirection, expectedDirection);
  });

  it("offsets the root to the reference coordinate and draws the reference arrow only when enabled", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();
    const chain = [makeNode("Node")];

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", chain, true),
      [1, 2, 3],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    const root = scene.getTransformNodeByName(
      "coordinateSystemGimbalRoot_node"
    )!;
    expectVectorCloseTo(
      root.position,
      toSceneVector(RAS_DIRECTIONS, [1, 2, 3])
    );
    expect(
      scene.getMeshByName("coordinateSystemGimbalReference_mesh")
    ).toBeTruthy();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", chain, false),
      [1, 2, 3],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    expect(
      scene.getMeshByName("coordinateSystemGimbalReference_mesh")
    ).toBeNull();
    expect(
      scene.getMeshByName("coordinateSystemGimbalReference_mesh_head")
    ).toBeNull();
  });

  it("leaves the reference arrow spanning the atlas origin, unturned by the rest orientation", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")], true),
      [1, 2, 3],
      RAS_DIRECTIONS,
      DOWNWARD_REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    const atlasRoot = buildAtlasRootNode(scene);
    const head = scene.getMeshByName(
      "coordinateSystemGimbalReference_mesh_head"
    )!;
    // The arrow's head sits just short of the atlas origin, whichever way the
    // probe rests, because the rest rotation lives below the offset root.
    const originInAtlasRoot = Vector3.TransformCoordinates(
      Vector3.Zero(),
      atlasRoot.computeWorldMatrix(true)
    );
    const headWorld = head.computeWorldMatrix(true).getTranslation();
    expect(Vector3.Distance(headWorld, originInAtlasRoot)).toBeLessThan(
      toSceneVector(RAS_DIRECTIONS, [1, 2, 3]).length()
    );
  });

  it("draws a link arrow only for a non-zero translation, head beyond shaft", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );
    expect(scene.getMeshByName("coordinateSystemGimbalLink_0_mesh")).toBeNull();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node", [2, 0, 0])]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );
    const shaft = scene.getMeshByName("coordinateSystemGimbalLink_0_mesh")!;
    const head = scene.getMeshByName("coordinateSystemGimbalLink_0_mesh_head")!;
    expect(shaft).toBeTruthy();
    expect(head).toBeTruthy();
    expect(head.position.length()).toBeGreaterThan(shaft.position.length());
  });

  it("colours each gimbal axis cylinder from the local frame's palette, unlit", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    const expectedColors: [string, Color3][] = [
      ["coordinateSystemGimbalAxisX_material", LOCAL_FRAME_AXIS_COLORS[0]],
      ["coordinateSystemGimbalAxisY_material", LOCAL_FRAME_AXIS_COLORS[1]],
      ["coordinateSystemGimbalAxisZ_material", LOCAL_FRAME_AXIS_COLORS[2]]
    ];
    for (const [name, color] of expectedColors) {
      const material = scene.getMaterialByName(name) as StandardMaterial;
      expect(material).toBeTruthy();
      expect(material.emissiveColor.equals(color)).toBe(true);
      expect(material.disableLighting).toBe(true);
    }
  });

  it("outlines exactly the focused node's own meshes, excluding the next node's link arrow", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();
    const chain = [makeNode("Parent"), makeNode("Child", [1, 0, 0])];

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", chain),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      0,
      makeProbeGeometry()
    );

    const parentOrigin = scene.getMeshByName(
      "coordinateSystemGimbal_0_origin_mesh"
    )!;
    const parentAxisX = scene.getMeshByName(
      "coordinateSystemGimbal_0_axisX_mesh"
    )!;
    const childOrigin = scene.getMeshByName(
      "coordinateSystemGimbal_1_origin_mesh"
    )!;
    const linkArrow = scene.getMeshByName("coordinateSystemGimbalLink_1_mesh")!;

    expect(selectionOutlineLayer.hasMesh(parentOrigin)).toBe(true);
    expect(selectionOutlineLayer.hasMesh(parentAxisX)).toBe(true);
    expect(selectionOutlineLayer.hasMesh(childOrigin)).toBe(false);
    expect(selectionOutlineLayer.hasMesh(linkArrow)).toBe(false);
  });

  it("outlines nothing for an out-of-range focused index", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      5,
      makeProbeGeometry()
    );

    const origin = scene.getMeshByName("coordinateSystemGimbal_0_origin_mesh")!;
    expect(selectionOutlineLayer.hasMesh(origin)).toBe(false);
  });

  it("disposes the gimbal root without touching the outline layer when nothing is selected", () => {
    const { scene, selectionOutlineLayer } = makeTestSceneWithGizmo();
    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      buildCoordinateSystem("Fixture", [makeNode("Node")]),
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );
    const unrelated = MeshBuilder.CreateBox("unrelated", {}, scene);
    selectionOutlineLayer.addSelection([unrelated]);

    syncCoordinateSystemGimbals(
      scene,
      selectionOutlineLayer,
      null,
      [0, 0, 0],
      RAS_DIRECTIONS,
      REST,
      ATLAS_SCALE_MILLIMETERS,
      null,
      makeProbeGeometry()
    );

    expect(
      scene.getTransformNodeByName("coordinateSystemGimbalRoot_node")
    ).toBeNull();
    expect(
      scene.getTransformNodeByName("coordinateSystemGimbalRest_node")
    ).toBeNull();
    expect(
      scene.getMeshByName("coordinateSystemGimbalPoseHeadStageTemplate_mesh")
    ).toBeNull();
    expect(selectionOutlineLayer.hasMesh(unrelated)).toBe(true);
  });
});
