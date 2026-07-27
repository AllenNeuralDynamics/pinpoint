import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import {
  Color3,
  DracoDecoder,
  Geometry,
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer,
  VertexData,
  WorkerPool
} from "@babylonjs/core";
import {
  removeAllStructures,
  setAtlasCenterOffset,
  syncStructureVisibility
} from "./entity-loader.api";
import type { StructureEntity } from "../models/structure-entity.model";
import { asrToBabylon } from "./coordinate-transforms.api";

vi.mock("axios");

// Every test spies on `decodeMeshToGeometryAsync` directly, so the codec's
// own worker pool is never exercised -- but merely accessing
// `DracoDecoder.Default` still lazily constructs it, and its default
// configuration would fetch the real wasm binary from
// cdn.babylonjs.com. Supplying an (unused) empty worker pool short-circuits
// that construction with no network access.
DracoDecoder.ResetDefault(true);
DracoDecoder.DefaultConfiguration = { workerPool: new WorkerPool([]) };

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

/** Build a real Babylon scene for tests that need actual mesh geometry. */
function makeScene(): Scene {
  return new Scene(new NullEngine());
}

/**
 * Build a positions+indices-only geometry (no normals), mirroring what a
 * Draco decode produces, from a subdivided sphere so it has enough vertices
 * to simplify meaningfully.
 */
function makeRawGeometry(scene: Scene, id = "geometry"): Geometry {
  const source = MeshBuilder.CreateSphere(
    `${id}_source`,
    { segments: 12 },
    scene
  );
  const vertexData = new VertexData();
  vertexData.positions = source.getVerticesData(VertexBuffer.PositionKind);
  vertexData.indices = source.getIndices();
  source.dispose();

  return new Geometry(id, scene, vertexData, false);
}

/** Build a positions+indices-only mesh (see `makeRawGeometry`). */
function makeUnlitMesh(scene: Scene, name = "raw"): Mesh {
  const mesh = new Mesh(name, scene);
  makeRawGeometry(scene, `${name}_geometry`).applyToMesh(mesh);
  return mesh;
}

/** Stub Draco decoding with a real, positions-only sphere geometry. */
function stubDecode(scene: Scene) {
  return vi
    .spyOn(DracoDecoder.Default, "decodeMeshToGeometryAsync")
    .mockImplementation(name => Promise.resolve(makeRawGeometry(scene, name)));
}

/**
 * Build a positions+indices-only geometry wound for a right-handed system,
 * like a real BrainGlobe Draco mesh -- the opposite of what this (left-handed)
 * scene expects, and what `decodeMesh`'s internal winding-order fix corrects.
 */
function makeRightHandedWoundGeometry(scene: Scene, id = "geometry"): Geometry {
  const mesh = makeUnlitMesh(scene, `${id}_mesh`);
  const reversed = Array.from(mesh.getIndices()!);
  for (let i = 0; i < reversed.length; i += 3) {
    const temp = reversed[i + 1]!;
    reversed[i + 1] = reversed[i + 2]!;
    reversed[i + 2] = temp;
  }
  mesh.setIndices(reversed);

  const vertexData = new VertexData();
  vertexData.positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  vertexData.indices = mesh.getIndices();
  mesh.dispose();

  return new Geometry(id, scene, vertexData, false);
}

/**
 * Fraction of a mesh's vertices whose computed normal points away from the
 * mesh centroid (i.e. outward).
 */
function outwardNormalFraction(mesh: Mesh): number {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const vertexCount = mesh.getTotalVertices();

  const centroid = new Vector3(0, 0, 0);
  for (let i = 0; i < vertexCount; i++) {
    centroid.addInPlace(
      new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
    );
  }
  centroid.scaleInPlace(1 / vertexCount);

  let outward = 0;
  for (let i = 0; i < vertexCount; i++) {
    const direction = new Vector3(
      positions[i * 3]!,
      positions[i * 3 + 1]!,
      positions[i * 3 + 2]!
    )
      .subtract(centroid)
      .normalize();
    const normal = new Vector3(
      normals[i * 3]!,
      normals[i * 3 + 1]!,
      normals[i * 3 + 2]!
    );
    if (Vector3.Dot(direction, normal) > 0) outward++;
  }
  return outward / vertexCount;
}

describe("syncStructureVisibility", () => {
  // axios.get is only ever passed to vi.mocked() to retrieve its mock, never
  // called unbound.
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockResolvedValue({ data: new ArrayBuffer(0) });
  });

  it("imports a new structure, parented to the atlas root and colored", async () => {
    const scene = makeScene();
    const decodeSpy = stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });

    await syncStructureVisibility(scene, [], [structure]);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    const mesh = atlasRootNode
      .getChildren()
      .find(c => c.name === "1_structure") as Mesh;
    expect(mesh).toBeDefined();
    expect(mesh.isVisible).toBe(true);
    expect(mesh.isVerticesDataPresent(VertexBuffer.NormalKind)).toBe(true);
    expect(mesh.getVerticesData(VertexBuffer.NormalKind)!.length).toBe(
      mesh.getTotalVertices() * 3
    );

    const material = mesh.material as StandardMaterial;
    expect(material.name).toBe("1_material");
    expect(material.diffuseColor.equals(structure.color)).toBe(true);
    expect(material.alpha).toBe(1);

    // Mesh bytes are fetched as a raw array buffer from the structure's own
    // mesh path.
    expect(mockedGet).toHaveBeenCalledWith(structure.meshPath, {
      responseType: "arraybuffer"
    });

    decodeSpy.mockRestore();
  });

  it("scales a structure's decoded geometry from nanometers to millimeters", async () => {
    const scene = makeScene();
    // A single triangle at (1_000_000, 2_000_000, 3_000_000) nm, mirroring a
    // Draco-decoded structure mesh, so the resulting mesh should sit at
    // (1, 2, 3) mm.
    const vertexData = new VertexData();
    vertexData.positions = [1_000_000, 2_000_000, 3_000_000, 0, 0, 0, 0, 0, 0];
    vertexData.indices = [0, 1, 2];
    const geometry = new Geometry("draco_geometry", scene, vertexData, false);
    const decodeSpy = vi
      .spyOn(DracoDecoder.Default, "decodeMeshToGeometryAsync")
      .mockResolvedValue(geometry);
    const structure = makeStructureEntity({ identifier: 1 });

    await syncStructureVisibility(scene, [], [structure]);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    const mesh = atlasRootNode
      .getChildren()
      .find(c => c.name === "1_structure") as Mesh;
    // Positions are float32, so allow for the usual float32 rounding error.
    const [x, y, z] = Array.from(
      mesh.getVerticesData(VertexBuffer.PositionKind)!
    );
    expect(x).toBeCloseTo(1, 5);
    expect(y).toBeCloseTo(2, 5);
    expect(z).toBeCloseTo(3, 5);

    decodeSpy.mockRestore();
  });

  it("caps a structure's simplified vertex count at 8000", async () => {
    const scene = makeScene();
    // A sphere with well over 8000 * 20 vertices, so the 5%-of-original
    // budget alone would exceed the hard cap and only the cap applies.
    const denseSphere = MeshBuilder.CreateSphere(
      "dense",
      { segments: 200 },
      scene
    );
    const vertexData = new VertexData();
    vertexData.positions = denseSphere.getVerticesData(
      VertexBuffer.PositionKind
    );
    vertexData.indices = denseSphere.getIndices();
    const originalVertexCount = denseSphere.getTotalVertices();
    denseSphere.dispose();
    // decodeMesh disposes the geometry it's handed once its data is copied
    // out, so the original count must be read before syncing.
    const geometry = new Geometry("draco_geometry", scene, vertexData, false);
    const decodeSpy = vi
      .spyOn(DracoDecoder.Default, "decodeMeshToGeometryAsync")
      .mockResolvedValue(geometry);
    const structure = makeStructureEntity({ identifier: 1 });

    await syncStructureVisibility(scene, [], [structure]);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    const mesh = atlasRootNode
      .getChildren()
      .find(c => c.name === "1_structure") as Mesh;
    expect(mesh.getTotalVertices()).toBeLessThanOrEqual(8000);
    expect(mesh.getTotalVertices()).toBeLessThan(originalVertexCount);

    decodeSpy.mockRestore();
  });

  it("corrects a right-handed-wound mesh so its normals face outward", async () => {
    const scene = makeScene();
    // BrainGlobe Draco meshes are wound for a right-handed system; decodeMesh
    // must flip that internally so the scene's (left-handed) lighting sees
    // outward-facing normals instead of backface-culled, inward-facing ones.
    const decodeSpy = vi
      .spyOn(DracoDecoder.Default, "decodeMeshToGeometryAsync")
      .mockImplementation(name =>
        Promise.resolve(makeRightHandedWoundGeometry(scene, name))
      );
    const structure = makeStructureEntity({ identifier: 1 });

    await syncStructureVisibility(scene, [], [structure]);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    const mesh = atlasRootNode
      .getChildren()
      .find(c => c.name === "1_structure") as Mesh;
    expect(outwardNormalFraction(mesh)).toBeGreaterThan(0.9);

    decodeSpy.mockRestore();
  });

  it("fades an always-present structure that isn't visible to alpha 0.1", async () => {
    const scene = makeScene();
    const decodeSpy = stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });

    await syncStructureVisibility(scene, [structure], []);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    const mesh = atlasRootNode
      .getChildren()
      .find(c => c.name === "1_structure") as Mesh;
    expect(mesh.material!.alpha).toBe(0.1);

    decodeSpy.mockRestore();
  });

  it("does not re-import a structure that's already present", async () => {
    const scene = makeScene();
    const decodeSpy = stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });

    await syncStructureVisibility(scene, [], [structure]);
    decodeSpy.mockClear();
    await syncStructureVisibility(scene, [], [structure]);

    expect(decodeSpy).not.toHaveBeenCalled();

    decodeSpy.mockRestore();
  });

  it("removes structures that are no longer desired", async () => {
    const scene = makeScene();
    const decodeSpy = stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });

    await syncStructureVisibility(scene, [], [structure]);
    await syncStructureVisibility(scene, [], []);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(
      atlasRootNode.getChildren().some(c => c.name === "1_structure")
    ).toBe(false);

    decodeSpy.mockRestore();
  });

  it("disposes a removed structure's material rather than leaking it, and its alpha is correct once re-imported", async () => {
    const scene = makeScene();
    const decodeSpy = stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });

    // Import the structure, remove it, then bring it back as
    // always-present-but-not-visible.
    await syncStructureVisibility(scene, [], [structure]);
    await syncStructureVisibility(scene, [], []);
    await syncStructureVisibility(scene, [structure], []);

    // The removed material must not linger: exactly one "1_material" should
    // exist, not an orphaned first one shadowing the live one.
    expect(scene.materials.filter(m => m.name === "1_material")).toHaveLength(
      1
    );

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    const mesh = atlasRootNode
      .getChildren()
      .find(c => c.name === "1_structure") as Mesh;
    expect(mesh.material!.alpha).toBe(0.1);

    decodeSpy.mockRestore();
  });

  it("gives each structure its own alpha rather than collapsing on a shared key", async () => {
    const scene = makeScene();
    const decodeSpy = stubDecode(scene);
    const alwaysPresent = makeStructureEntity({ identifier: 1 });
    const visible = makeStructureEntity({ identifier: 2 });

    await syncStructureVisibility(scene, [alwaysPresent, visible], [visible]);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    const meshes = atlasRootNode.getChildren() as Mesh[];
    const fadedMesh = meshes.find(m => m.name === "1_structure")!;
    const visibleMesh = meshes.find(m => m.name === "2_structure")!;

    expect(fadedMesh.material!.alpha).toBe(0.1);
    expect(visibleMesh.material!.alpha).toBe(1);

    decodeSpy.mockRestore();
  });

  it("rejects on a failed mesh fetch and adds nothing to the scene", async () => {
    const scene = makeScene();
    mockedGet.mockRejectedValue(new Error("network error"));
    const structure = makeStructureEntity({ identifier: 1 });

    await expect(
      syncStructureVisibility(scene, [], [structure])
    ).rejects.toThrow("network error");

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(atlasRootNode.getChildren()).toEqual([]);
    // The placeholder mesh created up front, and its material, must not
    // linger once the import that would have filled it in fails.
    expect(scene.materials).toEqual([]);
  });

  it("rejects on a failed decode and adds nothing to the scene", async () => {
    const scene = makeScene();
    const decodeSpy = vi
      .spyOn(DracoDecoder.Default, "decodeMeshToGeometryAsync")
      .mockRejectedValue(new Error("bad draco data"));
    const structure = makeStructureEntity({ identifier: 1 });

    await expect(
      syncStructureVisibility(scene, [], [structure])
    ).rejects.toThrow("bad draco data");

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(atlasRootNode.getChildren()).toEqual([]);
    expect(scene.materials).toEqual([]);

    decodeSpy.mockRestore();
  });

  it("rejects with the original error so the caller can surface it", async () => {
    const scene = makeScene();
    const decodeError = new Error("bad draco data");
    const decodeSpy = vi
      .spyOn(DracoDecoder.Default, "decodeMeshToGeometryAsync")
      .mockRejectedValue(decodeError);
    const structure = makeStructureEntity({ identifier: 1 });

    await expect(syncStructureVisibility(scene, [], [structure])).rejects.toBe(
      decodeError
    );

    decodeSpy.mockRestore();
  });

  it("finishes and disposes every failing structure's placeholder even when a sibling also fails, so a later sync retries them", async () => {
    const scene = makeScene();
    stubDecode(scene);
    const failing = makeStructureEntity({
      identifier: 1,
      meshPath: "http://localhost:3000/allen_mouse/meshes/1.glb"
    });
    const succeeding = makeStructureEntity({
      identifier: 2,
      meshPath: "http://localhost:3000/allen_mouse/meshes/2.glb"
    });

    // Gate both fetches on deferred promises so the failing one's rejection
    // lands while the succeeding one is still in flight -- reproducing the
    // case where `Promise.all` would have left the succeeding structure's
    // placeholder abandoned mid-import.
    let resolveSucceeding!: (value: { data: ArrayBuffer }) => void;
    mockedGet.mockImplementation(url =>
      url === failing.meshPath
        ? Promise.reject(new Error("network error"))
        : new Promise(resolve => (resolveSucceeding = resolve))
    );

    const syncPromise = syncStructureVisibility(
      scene,
      [],
      [failing, succeeding]
    );
    await Promise.resolve();
    await Promise.resolve();
    resolveSucceeding({ data: new ArrayBuffer(0) });

    await expect(syncPromise).rejects.toThrow("network error");

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(
      atlasRootNode.getChildren().some(c => c.name === "1_structure")
    ).toBe(false);
    expect(scene.materials.some(m => m.name === "1_material")).toBe(false);
    const succeedingMesh = atlasRootNode
      .getChildren()
      .find(c => c.name === "2_structure") as Mesh;
    expect(succeedingMesh).toBeDefined();
    expect(succeedingMesh.isVisible).toBe(true);

    // The failed structure's placeholder was disposed rather than left
    // dangling, so a later sync sees it as absent and retries it.
    mockedGet.mockReset();
    mockedGet.mockResolvedValue({ data: new ArrayBuffer(0) });
    await syncStructureVisibility(scene, [], [failing, succeeding]);

    expect(mockedGet).toHaveBeenCalledWith(failing.meshPath, {
      responseType: "arraybuffer"
    });
    expect(
      atlasRootNode.getChildren().some(c => c.name === "1_structure")
    ).toBe(true);
  });

  it("imports missing structures concurrently rather than one at a time", async () => {
    const scene = makeScene();
    stubDecode(scene);
    const structures = [
      makeStructureEntity({ identifier: 1 }),
      makeStructureEntity({ identifier: 2 })
    ];

    // Gate both fetches on deferred promises so neither can resolve until
    // both have been requested -- proving they were started concurrently
    // rather than one after another.
    const deferred = structures.map(() => {
      let resolve!: (value: { data: ArrayBuffer }) => void;
      const promise = new Promise<{ data: ArrayBuffer }>(r => (resolve = r));
      return { promise, resolve };
    });
    let callIndex = 0;
    mockedGet.mockImplementation(() => deferred[callIndex++]!.promise);

    const syncPromise = syncStructureVisibility(scene, [], structures);

    // Give both requests a chance to fire before resolving either.
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedGet).toHaveBeenCalledTimes(2);

    deferred.forEach(({ resolve }) => resolve({ data: new ArrayBuffer(0) }));
    await syncPromise;

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(
      atlasRootNode
        .getChildren()
        .map(c => c.name)
        .sort()
    ).toEqual(["1_structure", "2_structure"]);
  });

  it("imports a structure only once when two syncs overlap for it", async () => {
    const scene = makeScene();
    stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });

    // Gate the fetch so the first sync's import is still in flight when the
    // second sync starts -- reproducing the reported race, where an
    // overlapping call used to see an empty scene and import again.
    let resolveFetch!: (value: { data: ArrayBuffer }) => void;
    mockedGet.mockImplementation(
      () => new Promise(resolve => (resolveFetch = resolve))
    );

    const first = syncStructureVisibility(scene, [], [structure]);
    await Promise.resolve(); // let the first sync claim its placeholder mesh
    const second = syncStructureVisibility(scene, [], [structure]);

    resolveFetch({ data: new ArrayBuffer(0) });
    await Promise.all([first, second]);

    expect(mockedGet).toHaveBeenCalledTimes(1);
    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(
      atlasRootNode.getChildren().filter(c => c.name === "1_structure")
    ).toHaveLength(1);
    expect(scene.materials.filter(m => m.name === "1_material")).toHaveLength(
      1
    );
  });

  it("sets a faded structure's alpha before its geometry has loaded", async () => {
    const scene = makeScene();
    stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });

    let resolveFetch!: (value: { data: ArrayBuffer }) => void;
    mockedGet.mockImplementation(
      () => new Promise(resolve => (resolveFetch = resolve))
    );

    const syncPromise = syncStructureVisibility(scene, [structure], []);
    await Promise.resolve();

    // The placeholder's material must already be at the assigned alpha
    // before the fetch (or anything after it) resolves -- a structure should
    // never render at a material's default alpha while it loads.
    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    const mesh = atlasRootNode
      .getChildren()
      .find(c => c.name === "1_structure") as Mesh;
    expect(mesh.material!.alpha).toBe(0.1);
    expect(mesh.isVisible).toBe(false);

    resolveFetch({ data: new ArrayBuffer(0) });
    await syncPromise;
    expect(mesh.isVisible).toBe(true);
  });

  it("does not resurrect a structure that a later sync removed while its import was in flight", async () => {
    const scene = makeScene();
    stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });

    let resolveFetch!: (value: { data: ArrayBuffer }) => void;
    mockedGet.mockImplementation(
      () => new Promise(resolve => (resolveFetch = resolve))
    );

    const first = syncStructureVisibility(scene, [], [structure]);
    await Promise.resolve();

    // The structure is no longer desired by the time the second sync runs,
    // so it disposes the still-loading placeholder mesh.
    const second = syncStructureVisibility(scene, [], []);

    resolveFetch({ data: new ArrayBuffer(0) });
    await Promise.all([first, second]);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(
      atlasRootNode.getChildren().some(c => c.name === "1_structure")
    ).toBe(false);
    expect(scene.materials).toEqual([]);
  });
});

describe("removeAllStructures", () => {
  // axios.get is only ever passed to vi.mocked() to retrieve its mock, never
  // called unbound.
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockResolvedValue({ data: new ArrayBuffer(0) });
  });

  it("disposes every structure mesh and its material", async () => {
    const scene = makeScene();
    const decodeSpy = stubDecode(scene);
    const structures = [
      makeStructureEntity({ identifier: 1 }),
      makeStructureEntity({ identifier: 2 })
    ];
    await syncStructureVisibility(scene, [], structures);
    decodeSpy.mockRestore();

    removeAllStructures(scene);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(atlasRootNode.getChildren()).toEqual([]);
    expect(scene.materials).toEqual([]);
  });

  it("leaves the atlas root node itself in place", async () => {
    const scene = makeScene();
    const decodeSpy = stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });
    await syncStructureVisibility(scene, [], [structure]);
    decodeSpy.mockRestore();

    removeAllStructures(scene);

    expect(scene.getTransformNodeByName("atlasRoot_node")).not.toBeNull();
  });

  it("leaves a non-structure child of the atlas root alone", async () => {
    const scene = makeScene();
    const decodeSpy = stubDecode(scene);
    const structure = makeStructureEntity({ identifier: 1 });
    await syncStructureVisibility(scene, [], [structure]);
    decodeSpy.mockRestore();
    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    const unrelatedMesh = new Mesh("probeTip_mesh", scene);
    unrelatedMesh.parent = atlasRootNode;

    removeAllStructures(scene);

    expect(atlasRootNode.getChildren()).toEqual([unrelatedMesh]);
  });

  it("creates the atlas root node and no-ops on a scene with no structures", () => {
    const scene = makeScene();

    removeAllStructures(scene);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node");
    expect(atlasRootNode).not.toBeNull();
    expect(atlasRootNode!.getChildren()).toEqual([]);
  });
});

describe("setAtlasCenterOffset", () => {
  it("creates the atlas root node with the expected rotation", () => {
    const scene = makeScene();

    setAtlasCenterOffset(scene, [0, 0, 0]);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(atlasRootNode.rotation.equals(new Vector3(Math.PI, 0, 0))).toBe(
      true
    );
  });

  it("offsets the atlas root so the atlas center sits at the origin", () => {
    const scene = makeScene();
    const center: [number, number, number] = [5.7, 0.44, 5.4];

    setAtlasCenterOffset(scene, center);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node")!;
    expect(atlasRootNode.position.equals(asrToBabylon(center).negate())).toBe(
      true
    );
  });

  it("reuses the existing atlas root node on a second call", () => {
    const scene = makeScene();

    setAtlasCenterOffset(scene, [1, 2, 3]);
    const first = scene.getTransformNodeByName("atlasRoot_node");
    setAtlasCenterOffset(scene, [4, 5, 6]);
    const second = scene.getTransformNodeByName("atlasRoot_node");

    expect(first).toBe(second);
  });
});
