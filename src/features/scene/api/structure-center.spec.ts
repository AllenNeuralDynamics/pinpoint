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
import { makeTestScene, stubDracoDecoder } from "@/test/mount-helper";
import { makeAtlas } from "@/test/fixtures";

vi.mock("axios");

// Every test spies on `decodeMeshToGeometryAsync` directly, so the codec's
// own worker pool is never exercised.
stubDracoDecoder();

/** Atlas shared by tests that aren't specifically about switching atlases. */
const atlas = makeAtlas();

/** ML midline of `atlas`: `456 * 0.025 / 2`. */
const MIDLINE_MILLIMETERS = 5.7;

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
  const positions = [6, 1, 2, 8, 3, 4, 3, 9, 9];

  it("averages only the vertices on the right of the midline", () => {
    expect(
      hemisphereCenterMillimeters(positions, MIDLINE_MILLIMETERS, "right")
    ).toEqual([3, 2, 7]);
  });

  it("averages only the vertices on the left of the midline", () => {
    expect(
      hemisphereCenterMillimeters(positions, MIDLINE_MILLIMETERS, "left")
    ).toEqual([9, 9, 3]);
  });

  it("counts a vertex exactly on the midline as right, excluding it from left", () => {
    const onMidline = [MIDLINE_MILLIMETERS, 1, 2];

    expect(
      hemisphereCenterMillimeters(onMidline, MIDLINE_MILLIMETERS, "right")
    ).toEqual([2, 1, MIDLINE_MILLIMETERS]);
    expect(
      hemisphereCenterMillimeters(onMidline, MIDLINE_MILLIMETERS, "left")
    ).toBeNull();
  });

  it("returns null for a hemisphere with no vertices on that side", () => {
    const allLeft = [1, 1, 1, 2, 2, 2];

    expect(
      hemisphereCenterMillimeters(allLeft, MIDLINE_MILLIMETERS, "right")
    ).toBeNull();
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
      structure
    );

    expect(centers.right).toEqual([5, 3, 8]);
    expect(centers.left).toEqual([5, 3, 2]);
    expect(mockedGet).toHaveBeenCalledWith(structure.meshPath, {
      responseType: "arraybuffer"
    });
    expect(scene.meshes).toHaveLength(0);
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
      makeStructureEntity({ identifier: 8 })
    );

    expect(centers.right).toEqual([5, 3, 8]);
    expect(centers.left).toEqual([5, 3, 2]);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(decodeSpy).not.toHaveBeenCalled();
  });
});
