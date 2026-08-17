import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import {
  Color3,
  DracoDecoder,
  Geometry,
  Mesh,
  TransformNode,
  VertexData
} from "@babylonjs/core";
import {
  getStructureHemisphereCenters,
  hemisphereCenterMillimeters
} from "./structure-center.api";
import type { StructureEntity } from "@/features/atlas";
import { getAtlasCenter } from "@/features/atlas";
import type { AxisDirections } from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  CANONICAL_AXIS_DIRECTIONS,
  convertCoordinate,
  getLineAxisIndex
} from "@/utils/coordinate-frame";
import { SCENE_AXIS_DIRECTIONS } from "./coordinate-transforms.api";
import { makeTestScene, stubDracoDecoder } from "@/test/mount-helper";
import { makeAtlas } from "@/test/fixtures";

vi.mock("axios");

// Every test spies on `decodeMeshToGeometryAsync` directly, so the codec's
// own worker pool is never exercised.
stubDracoDecoder();

/** Atlas shared by tests that aren't specifically about switching atlases. */
const atlas = makeAtlas();

/**
 * Midline of `atlas` along the scene frame's left-right axis, in mm, taken from
 * the atlas itself so a resized fixture cannot leave it stale.
 */
const MIDLINE_MILLIMETERS = convertCoordinate(
  ATLAS_AXIS_DIRECTIONS,
  SCENE_AXIS_DIRECTIONS,
  getAtlasCenter(atlas)
)[getLineAxisIndex(SCENE_AXIS_DIRECTIONS, "leftRight")]!;

/**
 * Scene-frame vertex sitting the given canonical anatomical offset from the
 * atlas center, in mm, so a seeded vertex names the side of the animal it lies
 * on instead of restating a scene coordinate.
 * @param canonicalOffset Offset from the atlas center: x right, y anterior, z superior.
 */
function sceneVertexFromAtlasCenter(
  canonicalOffset: [number, number, number]
): [number, number, number] {
  const center = convertCoordinate(
    ATLAS_AXIS_DIRECTIONS,
    SCENE_AXIS_DIRECTIONS,
    getAtlasCenter(atlas)
  );
  const offset = convertCoordinate(
    CANONICAL_AXIS_DIRECTIONS,
    SCENE_AXIS_DIRECTIONS,
    canonicalOffset
  );
  return [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]];
}

/** Global system the app defaults to, to prove the centers follow the caller's frame. */
const RAS_AXIS_DIRECTIONS: AxisDirections = [
  "Left_to_right",
  "Posterior_to_anterior",
  "Inferior_to_superior"
];

function makeStructureEntity(
  overrides: Partial<StructureEntity> = {}
): StructureEntity {
  return {
    identifier: 1,
    meshPath: "http://localhost:3000/allen_mouse/meshes/1.glb",
    color: Color3.FromInts(255, 0, 0),
    ...overrides
  };
}

describe("hemisphereCenterMillimeters", () => {
  // Scene x runs toward the animal's right, so the animal's right hemisphere is
  // the side above the 5.7mm midline and its left hemisphere the side below.
  const positions = [6, 1, 2, 8, 3, 4, 3, 9, 9];

  it("names the side of the midline scene x grows toward the animal's right", () => {
    // The one mirror users could see: a vertex 2mm toward the animal's right,
    // seeded anatomically and converted, must land in the right hemisphere and
    // its mirror image in the left. Offsetting only the left-right axis keeps
    // both centers exact, since neither is an average of unequal coordinates.
    const rightward = sceneVertexFromAtlasCenter([2, 0, 0]);
    const leftward = sceneVertexFromAtlasCenter([-2, 0, 0]);
    const mirrored = [...rightward, ...leftward];

    expect(
      hemisphereCenterMillimeters(mirrored, MIDLINE_MILLIMETERS, "right")
    ).toEqual(rightward);
    expect(
      hemisphereCenterMillimeters(mirrored, MIDLINE_MILLIMETERS, "left")
    ).toEqual(leftward);
  });

  it("averages only the vertices on the animal's right of the midline, above it on scene x", () => {
    expect(
      hemisphereCenterMillimeters(positions, MIDLINE_MILLIMETERS, "right")
    ).toEqual([7, 2, 3]);
  });

  it("averages only the vertices on the animal's left of the midline, below it on scene x", () => {
    expect(
      hemisphereCenterMillimeters(positions, MIDLINE_MILLIMETERS, "left")
    ).toEqual([3, 9, 9]);
  });

  it("counts a vertex exactly on the midline as right, excluding it from left", () => {
    const onMidline = [MIDLINE_MILLIMETERS, 1, 2];

    expect(
      hemisphereCenterMillimeters(onMidline, MIDLINE_MILLIMETERS, "right")
    ).toEqual([MIDLINE_MILLIMETERS, 1, 2]);
    expect(
      hemisphereCenterMillimeters(onMidline, MIDLINE_MILLIMETERS, "left")
    ).toBeNull();
  });

  it("returns null for a hemisphere with no vertices on that side", () => {
    const allLeft = [1, 1, 1, 2, 2, 2];

    expect(
      hemisphereCenterMillimeters(allLeft, MIDLINE_MILLIMETERS, "right")
    ).toBeNull();
    expect(
      hemisphereCenterMillimeters(allLeft, MIDLINE_MILLIMETERS, "left")
    ).toEqual([1.5, 1.5, 1.5]);
  });

  it("returns null for both hemispheres given no vertices at all", () => {
    const empty = new Float32Array(0);

    expect(
      hemisphereCenterMillimeters(empty, MIDLINE_MILLIMETERS, "right")
    ).toBeNull();
    expect(
      hemisphereCenterMillimeters(empty, MIDLINE_MILLIMETERS, "left")
    ).toBeNull();
  });
});

describe("getStructureHemisphereCenters", () => {
  // axios.get is only ever passed to vi.mocked() to retrieve its mock, never
  // called unbound.
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockResolvedValue({ data: new ArrayBuffer(0) });
  });

  // Each test spies on `decodeMeshToGeometryAsync` fresh, so a spy from one
  // test never leaks its call history or implementation into the next.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and decodes a structure's mesh without adding anything to the scene", async () => {
    const scene = makeTestScene();
    const structure = makeStructureEntity();
    // Nanometers, converting exactly to mm [7,2,4, 9,4,6, 3,2,4, 1,4,6].
    const nanometers = [
      7e6, 2e6, 4e6, 9e6, 4e6, 6e6, 3e6, 2e6, 4e6, 1e6, 4e6, 6e6
    ];
    vi.spyOn(
      DracoDecoder.Default,
      "decodeMeshToGeometryAsync"
    ).mockImplementation(name => {
      const vertexData = new VertexData();
      vertexData.positions = nanometers;
      return Promise.resolve(new Geometry(name, scene, vertexData, false));
    });

    const centers = await getStructureHemisphereCenters(
      scene,
      atlas,
      structure,
      ATLAS_AXIS_DIRECTIONS
    );

    // Scene x runs toward the animal's right, so the high-x pair is its right
    // hemisphere. The atlas triple orders the centers AP, SI, ML, so the right
    // center is the one whose ML is above the 5.7mm midline.
    expect(centers.right).toEqual([5, 3, 8]);
    expect(centers.left).toEqual([5, 3, 2]);
    expect(mockedGet).toHaveBeenCalledWith(structure.meshPath, {
      responseType: "arraybuffer"
    });
    expect(scene.meshes).toHaveLength(0);
  });

  it("returns the centers in the frame the caller asks for", async () => {
    const scene = makeTestScene();
    const atlasRoot = new TransformNode("atlasRoot_node", scene);
    const mesh = new Mesh("8_structure_mesh", scene);
    mesh.parent = atlasRoot;
    const vertexData = new VertexData();
    vertexData.positions = [7, 2, 4, 9, 4, 6, 3, 2, 4, 1, 4, 6];
    vertexData.applyToMesh(mesh);

    const centers = await getStructureHemisphereCenters(
      scene,
      atlas,
      makeStructureEntity({ identifier: 8 }),
      RAS_AXIS_DIRECTIONS
    );

    // RAS counts rightward, anterior, and superior positive; the atlas origin
    // sits at the animal's left, anterior, superior corner, so both centers are
    // rightward of it and behind and below it.
    expect(centers.right).toEqual([8, -5, -3]);
    expect(centers.left).toEqual([2, -5, -3]);
  });

  it("reuses an already-decoded in-scene mesh instead of fetching or decoding", async () => {
    const scene = makeTestScene();
    const atlasRoot = new TransformNode("atlasRoot_node", scene);
    const mesh = new Mesh("8_structure_mesh", scene);
    mesh.parent = atlasRoot;
    const vertexData = new VertexData();
    vertexData.positions = [7, 2, 4, 9, 4, 6, 3, 2, 4, 1, 4, 6];
    vertexData.applyToMesh(mesh);
    const decodeSpy = vi.spyOn(
      DracoDecoder.Default,
      "decodeMeshToGeometryAsync"
    );

    const centers = await getStructureHemisphereCenters(
      scene,
      atlas,
      makeStructureEntity({ identifier: 8 }),
      ATLAS_AXIS_DIRECTIONS
    );

    expect(centers.right).toEqual([5, 3, 8]);
    expect(centers.left).toEqual([5, 3, 2]);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(decodeSpy).not.toHaveBeenCalled();
  });
});
