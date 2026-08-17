import { describe, expect, it } from "vitest";
import { Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import {
  fromSceneMagnitudes,
  fromSceneQuaternion,
  fromSceneVector,
  fromWorldVector,
  SCENE_AXIS_DIRECTIONS,
  toSceneMagnitudes,
  toSceneQuaternion,
  toSceneVector,
  toWorldVector
} from "./coordinate-transforms.api";
import { buildAtlasRootNode, setAtlasCenterOffset } from "./structures.api";
import { getAtlasCenter } from "@/features/atlas";
import type {
  AnatomicalDirection,
  AxisDirections,
  Matrix3
} from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  CANONICAL_AXIS_DIRECTIONS,
  getDirectionVector,
  getProbeRestRotation,
  isOrthogonalAxisDirections
} from "@/utils/coordinate-frame";
import { makeAtlas } from "@/test/fixtures";
import { makeTestScene } from "@/test/mount-helper";

/** Global system a user could pick that is neither the scene's nor the atlas's. */
const RAS_AXIS_DIRECTIONS: AxisDirections = [
  "Left_to_right",
  "Posterior_to_anterior",
  "Inferior_to_superior"
];

/** Coordinates exercised through every round trip. */
const CASES: [number, number, number][] = [
  [0, 0, 0],
  [1, 2, 3],
  [-1, -2, -3],
  [0.3, 0.4, 0.5]
];

describe("SCENE_AXIS_DIRECTIONS", () => {
  it("is the atlas root node's own frame: x right, y inferior, z posterior", () => {
    expect(SCENE_AXIS_DIRECTIONS).toEqual([
      "Left_to_right",
      "Superior_to_inferior",
      "Anterior_to_posterior"
    ]);
    expect(isOrthogonalAxisDirections(SCENE_AXIS_DIRECTIONS)).toBe(true);
  });
});

describe("toSceneVector", () => {
  it("puts an atlas coordinate's ML on x, SI on y, and AP on z, unsigned", () => {
    const vector = toSceneVector(ATLAS_AXIS_DIRECTIONS, [1, 2, 3]);

    expect(vector).toBeInstanceOf(Vector3);
    expect(vector.asArray()).toEqual([3, 2, 1]);
  });

  it("puts the animal's right on scene +x", () => {
    // The mirror this pins is the one users see: a coordinate one mm toward the
    // animal's right must land one mm along scene x, never against it.
    // `equals` is exact, and unlike an array comparison it reads the negated
    // zeros the axis permutation leaves behind as the zeros they are.
    expect(
      toSceneVector(
        CANONICAL_AXIS_DIRECTIONS,
        getDirectionVector("Left_to_right")
      ).equals(new Vector3(1, 0, 0))
    ).toBe(true);
  });

  it("negates the axes a global system points the opposite way", () => {
    // RAS x and the scene's both run rightward, so that value carries over; RAS
    // y is anterior and the scene's z is posterior; RAS z is superior and the
    // scene's y is inferior.
    expect(toSceneVector(RAS_AXIS_DIRECTIONS, [1, 2, 3]).asArray()).toEqual([
      1, -3, -2
    ]);
  });

  it.each(CASES.map(coordinate => [coordinate] as const))(
    "round-trips %j back out of the scene frame",
    coordinate => {
      // syncProbes writes a stored coordinate in and the gizmo drag observer
      // reads it back out; drift here would move a probe on every drag.
      expect(
        fromSceneVector(
          RAS_AXIS_DIRECTIONS,
          toSceneVector(RAS_AXIS_DIRECTIONS, coordinate)
        )
      ).toEqual(coordinate);
    }
  );
});

describe("toSceneMagnitudes", () => {
  it("permutes a scale onto the scene's axes without changing signs", () => {
    // A scale is unsigned, so the shared rightward x factor stays put and the
    // permuted anterior and superior factors swap places without flipping.
    const scaling = toSceneMagnitudes(RAS_AXIS_DIRECTIONS, [2, 3, 4]);

    expect(scaling.asArray()).toEqual([2, 4, 3]);
  });

  it("round-trips a scale back out of the scene frame", () => {
    expect(
      fromSceneMagnitudes(
        RAS_AXIS_DIRECTIONS,
        toSceneMagnitudes(RAS_AXIS_DIRECTIONS, [2, 3, 4])
      )
    ).toEqual([2, 3, 4]);
  });
});

describe("toWorldVector", () => {
  const atlas = makeAtlas();

  it("matches where the real scene hierarchy places the coordinate", () => {
    const scene = makeTestScene();
    setAtlasCenterOffset(scene, getAtlasCenter(atlas));
    const coordinate: [number, number, number] = [1, 2, 3];
    const child = new TransformNode("child", scene);
    child.parent = buildAtlasRootNode(scene);
    child.position = toSceneVector(ATLAS_AXIS_DIRECTIONS, coordinate);
    child.computeWorldMatrix(true);

    // The arithmetic shortcut derives world position from the atlas center
    // directly; this pins it to the node hierarchy `setAtlasCenterOffset` builds.
    expect(
      Vector3.Distance(
        child.absolutePosition,
        toWorldVector(ATLAS_AXIS_DIRECTIONS, atlas, coordinate)
      )
    ).toBeLessThan(1e-6);
  });

  it("keeps world space anatomically upright whatever the global system is", () => {
    const origin = toWorldVector(CANONICAL_AXIS_DIRECTIONS, atlas, [0, 0, 0]);
    const worldOf = (direction: AnatomicalDirection) =>
      toWorldVector(
        CANONICAL_AXIS_DIRECTIONS,
        atlas,
        getDirectionVector(direction)
      )
        .subtract(origin)
        .asArray();

    // Babylon world y is up, world z is forward past the animal's nose, and
    // world x runs across the midline toward the animal's right.
    expect(worldOf("Inferior_to_superior")).toEqual([0, 1, 0]);
    expect(worldOf("Posterior_to_anterior")).toEqual([0, 0, 1]);
    expect(worldOf("Left_to_right")).toEqual([1, 0, 0]);
  });

  it.each(CASES.map(coordinate => [coordinate] as const))(
    "round-trips %j through world space",
    coordinate => {
      const roundTripped = fromWorldVector(
        RAS_AXIS_DIRECTIONS,
        atlas,
        toWorldVector(RAS_AXIS_DIRECTIONS, atlas, coordinate)
      );

      // Subtracting and re-adding the atlas center costs a few bits, so this
      // pins the inverse, not bit equality.
      for (const [index, value] of coordinate.entries()) {
        expect(roundTripped[index]!).toBeCloseTo(value, 10);
      }
    }
  );
});

describe("toSceneQuaternion", () => {
  it("is the identity for the legacy probe rest orientation", () => {
    // A probe used to rest with its tip pointing anterior and its electrodes
    // facing superior, which is exactly the frame the scene renders in, so
    // picking that local system must leave a zero-rotation probe unturned.
    const quaternion = toSceneQuaternion(
      getProbeRestRotation({
        depthDirection: "Posterior_to_anterior",
        forwardDirection: "Inferior_to_superior"
      })
    );

    expect(quaternion.equalsWithEpsilon(Quaternion.Identity(), 1e-9)).toBe(
      true
    );
  });

  it("turns a body axis onto the direction the orientation gives it", () => {
    // The default rest points the shank (body +z) anterior and the electrode
    // face (body -y) superior.
    const quaternion = toSceneQuaternion(
      getProbeRestRotation({
        depthDirection: "Anterior_to_posterior",
        forwardDirection: "Inferior_to_superior"
      })
    );

    const shank = new Vector3(0, 0, 1).applyRotationQuaternion(quaternion);
    const face = new Vector3(0, -1, 0).applyRotationQuaternion(quaternion);

    expect(
      Vector3.Distance(
        shank,
        toSceneVector(CANONICAL_AXIS_DIRECTIONS, [0, 1, 0])
      )
    ).toBeLessThan(1e-9);
    expect(
      Vector3.Distance(
        face,
        toSceneVector(CANONICAL_AXIS_DIRECTIONS, [0, 0, 1])
      )
    ).toBeLessThan(1e-9);
  });

  it("round-trips an orientation through a quaternion", () => {
    const orientation: Matrix3 = getProbeRestRotation({
      depthDirection: "Superior_to_inferior",
      forwardDirection: "Posterior_to_anterior"
    });

    const roundTripped = fromSceneQuaternion(toSceneQuaternion(orientation));

    for (const [index, value] of orientation.entries()) {
      expect(roundTripped[index]!).toBeCloseTo(value, 9);
    }
  });
});
