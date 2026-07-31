import type { AbstractMesh, IndicesArray, Scene } from "@babylonjs/core";
import {
  DracoDecoder,
  Mesh,
  QuadraticErrorSimplification,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData
} from "@babylonjs/core";
import axios from "axios";
import type { StructureEntity } from "../models/structure-entity.model";
import { asrToBabylon } from "./coordinate-transforms.api";
import { setMaterialAlpha } from "./material.api";

/** Decoded structure geometry, ready to hand off to {@link simplifyGeometry}. */
interface DecodedMeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

/** Simplified vertex data, ready to apply to a mesh. */
interface SimplifiedGeometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

const ATLAS_ROOT_NODE_NAME = "atlasRoot_node";

/** BrainGlobe v3 Draco meshes store positions in nanometers. */
const NANOMETERS_TO_MILLIMETERS = 1e-6;

/** Keep at most this fraction of a mesh's original vertices. */
const MESH_VERTEX_KEEP_FRACTION = 0.05;

/** Hard ceiling on vertices per structure, regardless of original size. */
const MESH_MAX_VERTICES = 8000;

/** Iterations `QuadraticErrorSimplification` runs between `setTimeout` yields. */
const SIMPLIFY_SYNC_ITERATIONS = 20000;

/** Suffix applied to a structure's identifier to name its Babylon mesh. */
const STRUCTURE_MESH_SUFFIX = "_structure_mesh";

/** Suffix applied to a structure's identifier to name its Babylon material. */
const STRUCTURE_MATERIAL_SUFFIX = "_structure_material";

/** Alpha applied to a visible structure's material. */
const STRUCTURE_VISIBLE_ALPHA = 1;

/** Alpha applied to an always-present structure's material when faded out. */
const STRUCTURE_FADED_ALPHA = 0.1;

/**
 * Build the atlas root node or return the existing one.
 * @param scene Babylon scene to get the atlas root node from.
 */
export function buildAtlasRootNode(scene: Scene): TransformNode {
  let atlasRootNode = scene.getTransformNodeByName(ATLAS_ROOT_NODE_NAME);
  if (!atlasRootNode) {
    atlasRootNode = new TransformNode(ATLAS_ROOT_NODE_NAME, scene);
    atlasRootNode.rotation = new Vector3(Math.PI, 0, 0);
  }

  return atlasRootNode;
}

/**
 * Offset the atlas root node so the atlas is centered on the origin.
 * @param scene Scene containing the atlas root.
 * @param centerCoordinate Coordinates of the center of the atlas.
 */
export function setAtlasCenterOffset(
  scene: Scene,
  centerCoordinate: [number, number, number]
) {
  const atlasRootNode = buildAtlasRootNode(scene);
  atlasRootNode.position = asrToBabylon(centerCoordinate).negate();
}

/**
 * Sync the scene's structures with the given visibility, importing missing
 * geometry concurrently and fading always-present structures instead of
 * removing them.
 * @param scene Scene to sync.
 * @param alwaysPresentStructures Structures to keep in the scene at all times.
 * @param visibleStructures Structures that should be fully visible.
 */
export async function syncStructuresVisibility(
  scene: Scene,
  alwaysPresentStructures: StructureEntity[],
  visibleStructures: StructureEntity[]
) {
  const atlasRootNode = buildAtlasRootNode(scene);
  const presentMeshes = childStructureMeshes(atlasRootNode);

  const visibleIdentifiers = new Set(
    visibleStructures.map(({ identifier }) => identifier)
  );

  // Keyed by mesh name so always-present-and-visible structures collapse to
  // one entry and line up with `presentMeshes`.
  const desiredStructures = new Map(
    [...alwaysPresentStructures, ...visibleStructures].map(structure => [
      structureMeshName(structure.identifier),
      structure
    ])
  );

  for (const [meshName, mesh] of presentMeshes) {
    if (!desiredStructures.has(meshName)) mesh.dispose(false, true);
  }

  // Claim every missing structure with a placeholder mesh synchronously, so
  // a concurrent call's presence check sees it before this call's first await.
  const desiredMeshes = new Map<string, AbstractMesh>();
  const pendingImports: { structure: StructureEntity; mesh: Mesh }[] = [];
  for (const [meshName, structure] of desiredStructures) {
    const existing = presentMeshes.get(meshName);
    if (existing) {
      desiredMeshes.set(meshName, existing);
      continue;
    }

    const mesh = buildStructureMesh(scene, atlasRootNode, structure);
    desiredMeshes.set(meshName, mesh);
    pendingImports.push({ structure, mesh });
  }

  for (const [meshName, structure] of desiredStructures) {
    const material = desiredMeshes.get(meshName)?.material;
    if (material) {
      setMaterialAlpha(
        material,
        visibleIdentifiers.has(structure.identifier)
          ? STRUCTURE_VISIBLE_ALPHA
          : STRUCTURE_FADED_ALPHA
      );
    }
  }

  const results = await Promise.allSettled(
    pendingImports.map(({ structure, mesh }) =>
      loadStructureGeometry(mesh, structure, scene)
    )
  );

  const failure = results.find(result => result.status === "rejected");
  if (failure) throw failure.reason;
}

/**
 * Clear the structures in the scene.
 * @param scene Scene to clear structures for.
 */
export function removeAllStructures(scene: Scene) {
  const atlasRootNode = buildAtlasRootNode(scene);
  const children = childStructureMeshes(atlasRootNode);
  for (const [_, mesh] of children) {
    mesh.dispose(false, true);
  }
}

/**
 * Map the atlas root's direct structure-mesh children by name.
 * @param atlasRootNode Atlas root node to read structure meshes from.
 */
function childStructureMeshes(
  atlasRootNode: TransformNode
): Map<string, AbstractMesh> {
  return new Map(
    atlasRootNode
      .getChildMeshes(true, node => node.name.endsWith(STRUCTURE_MESH_SUFFIX))
      .map(mesh => [mesh.name, mesh])
  );
}

/**
 * Babylon mesh name for a structure, derived from its identifier.
 * @param identifier Structure identifier.
 */
function structureMeshName(identifier: number): string {
  return `${identifier}${STRUCTURE_MESH_SUFFIX}`;
}

/**
 * Babylon material name for a structure, derived from its identifier.
 * @param identifier Structure identifier.
 */
function structureMaterialName(identifier: number): string {
  return `${identifier}${STRUCTURE_MATERIAL_SUFFIX}`;
}

/**
 * Synchronously create a structure's hidden placeholder mesh and material,
 * parented under the atlas root, ready for {@link loadStructureGeometry}.
 * @param scene Scene to add the structure to.
 * @param atlasRootNode Atlas root node to parent the structure under.
 * @param structure Entity information for the structure.
 */
function buildStructureMesh(
  scene: Scene,
  atlasRootNode: TransformNode,
  structure: StructureEntity
): Mesh {
  const mesh = new Mesh(structureMeshName(structure.identifier), scene);
  mesh.parent = atlasRootNode;
  mesh.isVisible = false;

  const material = new StandardMaterial(
    structureMaterialName(structure.identifier),
    scene
  );
  material.diffuseColor = structure.color;
  mesh.material = material;
  material.freeze();

  return mesh;
}

/**
 * Compute the vertex budget for a simplified mesh: at most
 * `MESH_VERTEX_KEEP_FRACTION` of the original, capped at `MESH_MAX_VERTICES`.
 * @param vertexCount Original vertex count.
 */
function targetVertexCount(vertexCount: number): number {
  return Math.min(
    Math.round(vertexCount * MESH_VERTEX_KEEP_FRACTION),
    MESH_MAX_VERTICES
  );
}

/**
 * Fetch, decode, and simplify a structure's mesh geometry, then apply it to
 * its (already-present) placeholder mesh and reveal it. Bails out and
 * disposes the mesh if it was disposed by a later sync while awaiting.
 * @param mesh Placeholder mesh created by {@link buildStructureMesh}.
 * @param structure Entity information for the structure.
 * @param scene Scene the structure is being added to.
 */
async function loadStructureGeometry(
  mesh: Mesh,
  structure: StructureEntity,
  scene: Scene
) {
  try {
    const data = await fetchMeshData(structure.meshPath);
    if (mesh.isDisposed()) return;

    const decoded = await decodeMesh(
      scene,
      `${structure.identifier}_geometry`,
      data
    );
    if (mesh.isDisposed()) return;

    const simplified = await simplifyGeometry(
      scene,
      decoded.positions,
      decoded.indices,
      targetVertexCount(decoded.positions.length / 3)
    );
    if (mesh.isDisposed()) return;

    const vertexData = new VertexData();
    vertexData.positions = simplified.positions;
    vertexData.normals = simplified.normals;
    vertexData.indices = simplified.indices;
    vertexData.applyToMesh(mesh);
    mesh.isVisible = true;
  } catch (error) {
    mesh.dispose(false, true);
    throw error;
  }
}

/**
 * Simplify a mesh's geometry down to (approximately) the given vertex count
 * and compute smooth-shaded normals for it.
 * @param scene Scene to build the temporary mesh in.
 * @param positions Flat `[x, y, z, ...]` vertex positions.
 * @param indices Triangle indices.
 * @param targetVertices Desired vertex count.
 */
async function simplifyGeometry(
  scene: Scene,
  positions: Float32Array,
  indices: Uint32Array,
  targetVertices: number
): Promise<SimplifiedGeometry> {
  const mesh = new Mesh("simplify_scratch", scene);
  mesh.isVisible = false;
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh);

  let simplified = mesh;
  if (targetVertices < mesh.getTotalVertices()) {
    const simplification = new QuadraticErrorSimplification(mesh);
    simplification.syncIterations = SIMPLIFY_SYNC_ITERATIONS;
    simplified = await new Promise<Mesh>(resolve => {
      simplification.simplify(
        {
          quality: targetVertices / mesh.getTotalVertices(),
          distance: 0,
          optimizeMesh: false
        },
        resolve
      );
    });
    mesh.dispose();
  }

  simplified.createNormals(false);

  const result: SimplifiedGeometry = {
    positions: Float32Array.from(
      simplified.getVerticesData(VertexBuffer.PositionKind)!
    ),
    normals: Float32Array.from(
      simplified.getVerticesData(VertexBuffer.NormalKind)!
    ),
    indices: Uint32Array.from(simplified.getIndices()!)
  };

  simplified.dispose();
  return result;
}

/**
 * Fetch a structure's raw Draco-compressed mesh bytes.
 * @param meshPath URL of the mesh to fetch.
 */
async function fetchMeshData(meshPath: string): Promise<ArrayBuffer> {
  const response = await axios.get<ArrayBuffer>(meshPath, {
    responseType: "arraybuffer"
  });
  return response.data;
}

/**
 * Decode raw Draco mesh data into flat vertex data, correcting its winding
 * order and converting its nanometer-scale coordinates to millimeters.
 * @param scene Scene to decode the mesh into.
 * @param name Name for the decoded geometry.
 * @param data Raw Draco-compressed mesh bytes.
 */
async function decodeMesh(
  scene: Scene,
  name: string,
  data: ArrayBuffer
): Promise<DecodedMeshData> {
  const geometry = await DracoDecoder.Default.decodeMeshToGeometryAsync(
    name,
    scene,
    data
  );

  const positions = Float32Array.from(
    geometry.getVerticesData(VertexBuffer.PositionKind) ?? []
  );
  for (let i = 0; i < positions.length; i++) {
    positions[i]! *= NANOMETERS_TO_MILLIMETERS;
  }

  const indices = Uint32Array.from(geometry.getIndices() ?? []);
  flipIndicesWindingOrder(indices);

  geometry.dispose();

  return { positions, indices };
}

/**
 * Flip a flat array of triangle indices' winding order in place, correcting
 * BrainGlobe's right-handed meshes for the scene's left-handed convention.
 * @param indices Flat triangle indices, mutated in place.
 */
function flipIndicesWindingOrder(indices: IndicesArray): void {
  for (let i = 0; i < indices.length; i += 3) {
    const temp = indices[i + 1]!;
    indices[i + 1] = indices[i + 2]!;
    indices[i + 2] = temp;
  }
}
