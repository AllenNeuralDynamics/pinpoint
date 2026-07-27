import type { AbstractMesh, IndicesArray, Scene } from "@babylonjs/core";
import {
  DracoDecoder,
  Logger,
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

/**
 * Decoded structure geometry, ready to hand off to {@link simplifyGeometry}:
 * winding order corrected, and nanometer-scale coordinates converted to
 * millimeters.
 */
interface DecodedMeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Simplified vertex data, ready to apply to a mesh with
 * `VertexData.applyToMesh`.
 */
interface SimplifiedGeometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** BrainGlobe v3 Draco meshes store positions in nanometers. */
const NANOMETERS_TO_MILLIMETERS = 1e-6;

/** Keep at most this fraction of a mesh's original vertices. */
const MESH_VERTEX_KEEP_FRACTION = 0.05;

/** Hard ceiling on vertices per structure, regardless of original size. */
const MESH_MAX_VERTICES = 8000;

/**
 * Iterations `QuadraticErrorSimplification` runs between `setTimeout` yields.
 *
 * Babylon defaults this to 5000, which for these meshes means ~900 timer hops.
 * Browsers clamp nested `setTimeout` to a 4ms floor, so those hops cost more in
 * idle waiting (~3.4s, measured) than the simplification itself costs in CPU
 * (~2.4s, measured). Yielding less often trades a slightly longer worst-case
 * frame (~76ms, measured) for roughly half the wall-clock.
 */
const SIMPLIFY_SYNC_ITERATIONS = 20000;

/** Suffix applied to a structure's identifier to name its Babylon mesh. */
const STRUCTURE_MESH_SUFFIX = "_structure";

/** Suffix applied to a structure's identifier to name its Babylon material. */
const STRUCTURE_MATERIAL_SUFFIX = "_material";

/**
 * Offset the atlas root node so the given reference coordinate sits at the
 * scene origin.
 *
 * @param scene Scene containing the atlas root.
 * @param referenceCoordinate Reference coordinate (in ASR, mm) that the atlas
 * root should be offset by.
 */
export function setAtlasRootReference(
  scene: Scene,
  referenceCoordinate: [number, number, number]
) {
  const atlasRootNode = buildAtlasRootNode(scene);
  atlasRootNode.position = asrToBabylon(referenceCoordinate).negate();
}

/**
 * Sync the scene's structures with the given visibility.
 *
 * Structures in `alwaysPresentStructures` are never removed from the scene;
 * when they aren't also in `visibleStructures` they're faded out instead.
 * Structures in `visibleStructures` are fully visible, and are removed from
 * the scene once they're no longer in either list.
 *
 * Missing structures are imported concurrently rather than one at a time, so
 * total load time is bound by the slowest structure rather than their sum.
 *
 * Safe to call repeatedly and concurrently for the same desired state --
 * every phase up to and including alpha assignment runs synchronously, with
 * a placeholder mesh claiming each missing structure's name before this
 * function ever yields. An overlapping call's presence check therefore sees
 * that placeholder and skips the structure instead of importing it a second
 * time, and never observes a structure at any alpha other than the one this
 * call assigns it.
 *
 * @param scene Scene to sync.
 * @param alwaysPresentStructures Structures to keep in the scene at all times.
 * @param visibleStructures Structures that should be fully visible.
 */
export async function syncStructureVisibility(
  scene: Scene,
  alwaysPresentStructures: StructureEntity[],
  visibleStructures: StructureEntity[]
) {
  const atlasRootNode = buildAtlasRootNode(scene);
  const presentMeshes = childStructureMeshes(atlasRootNode);

  const visibleIdentifiers = new Set(
    visibleStructures.map(({ identifier }) => identifier)
  );

  // Keyed by mesh name (not identifier) so it lines up with `presentMeshes`
  // without either side having to parse a mesh name back into a number.
  // Also gives always-present-and-visible structures a single entry, since
  // both list a structure under the same identifier-derived mesh name.
  const desiredStructures = new Map(
    [...alwaysPresentStructures, ...visibleStructures].map(structure => [
      structureMeshName(structure.identifier),
      structure
    ])
  );

  // Remove structures that are present but no longer desired. Disposing the
  // material too avoids leaving an orphaned same-named material behind that
  // would shadow a later re-import's material in any name-based lookup. Safe
  // even if another sync's import for this identifier is still in flight --
  // that import checks `mesh.isDisposed()` after every await and bails out.
  for (const [meshName, mesh] of presentMeshes) {
    if (!desiredStructures.has(meshName)) mesh.dispose(false, true);
  }

  // Claim every missing structure with a placeholder mesh, synchronously, so
  // a concurrent sync's presence check sees it before this call's first
  // await. `pendingImports` tracks the ones this call is responsible for
  // loading geometry for.
  const desiredMeshes = new Map<string, AbstractMesh>();
  const pendingImports: { structure: StructureEntity; mesh: Mesh }[] = [];
  for (const [meshName, structure] of desiredStructures) {
    const existing = presentMeshes.get(meshName);
    if (existing) {
      desiredMeshes.set(meshName, existing);
      continue;
    }

    const mesh = buildStructureMesh(structure, atlasRootNode, scene);
    desiredMeshes.set(meshName, mesh);
    pendingImports.push({ structure, mesh });
  }

  // Set every structure's alpha now, before any geometry has loaded, so one
  // is never briefly visible at a material's default alpha.
  for (const [meshName, structure] of desiredStructures) {
    const material = desiredMeshes.get(meshName)?.material;
    if (material) {
      material.alpha = visibleIdentifiers.has(structure.identifier) ? 1 : 0.1;
    }
  }

  // Load every missing structure's geometry concurrently, and await them
  // collectively rather than one at a time.
  await Promise.all(
    pendingImports.map(({ structure, mesh }) =>
      loadStructureGeometry(structure, mesh, scene)
    )
  );
}

/**
 * Build the atlas root node or return the existing one.
 *
 * Shared by both exported functions above.
 * @param scene Babylon scene to get the atlas root node from.
 */
function buildAtlasRootNode(scene: Scene): TransformNode {
  let atlasRootNode = scene.getTransformNodeByName("atlasRoot_node");
  if (!atlasRootNode) {
    atlasRootNode = new TransformNode("atlasRoot_node", scene);
    atlasRootNode.rotation = new Vector3(Math.PI, 0, 0);
  }

  return atlasRootNode;
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
 * Synchronously create a structure's mesh and material, parented under the
 * atlas root, with no geometry yet -- hidden until
 * {@link loadStructureGeometry} fills it in.
 *
 * Kept synchronous (no awaits) so a mesh exists under `atlasRootNode` the
 * instant a structure is claimed, before anything yields to the event loop.
 * That's what lets an overlapping {@link syncStructureVisibility} call see
 * this structure as already accounted for instead of importing it again.
 *
 * @param structure Entity information for the structure.
 * @param atlasRootNode Atlas root node to parent the structure under.
 * @param scene Scene to add the structure to.
 */
function buildStructureMesh(
  structure: StructureEntity,
  atlasRootNode: TransformNode,
  scene: Scene
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

  return mesh;
}

/**
 * Fetch, decode, and simplify a structure's mesh geometry, then apply it to
 * its (already-present) placeholder mesh and reveal it.
 *
 * Simplification runs on the main thread, but {@link simplifyGeometry} yields
 * to the event loop throughout via Babylon's own chunked scheduling, so it
 * doesn't block rendering for its whole duration; concurrency across
 * structures comes from {@link syncStructureVisibility}'s `Promise.all`,
 * which lets their simplifications interleave instead of queuing.
 *
 * Bails out after each await if `mesh` was disposed in the meantime -- a
 * later sync decided this structure is no longer desired, so its geometry
 * shouldn't resurrect it.
 *
 * @param structure Entity information for the structure.
 * @param mesh Placeholder mesh created by {@link buildStructureMesh}.
 * @param scene Scene the structure is being added to.
 */
async function loadStructureGeometry(
  structure: StructureEntity,
  mesh: Mesh,
  scene: Scene
) {
  try {
    const data = await fetchMeshData(structure.meshPath);
    if (mesh.isDisposed()) return;

    const decoded = await decodeMesh(
      `${structure.identifier}_geometry`,
      data,
      scene
    );
    if (mesh.isDisposed()) return;

    const simplified = await simplifyGeometry(
      decoded.positions,
      decoded.indices,
      targetVertexCount(decoded.positions.length / 3),
      scene
    );
    if (mesh.isDisposed()) return;

    const vertexData = new VertexData();
    vertexData.positions = simplified.positions;
    vertexData.normals = simplified.normals;
    vertexData.indices = simplified.indices;
    vertexData.applyToMesh(mesh);
    mesh.isVisible = true;
  } catch (error) {
    // Skip structures that fail to load, but don't hide why. Dispose the
    // placeholder too so a later sync retries rather than leaving an empty,
    // permanently-hidden mesh behind.
    mesh.dispose(false, true);
    Logger.Warn(
      `Failed to import structure ${structure.identifier}: ${String(error)}`
    );
  }
}

/**
 * Simplify a mesh's geometry down to (approximately) the given vertex count
 * and compute smooth-shaded normals for it.
 *
 * Builds its own temporary mesh in `scene` rather than taking one -- both the
 * source and `QuadraticErrorSimplification`'s reconstructed output are
 * disposed before returning, so nothing from this call lingers in the scene.
 * The temporary mesh is explicitly hidden and left unparented so it can never
 * flash on screen or be mistaken for a structure mesh by
 * {@link childStructureMeshes} while simplification runs.
 *
 * @param positions Flat `[x, y, z, ...]` vertex positions.
 * @param indices Triangle indices.
 * @param targetVertices Desired vertex count.
 * @param scene Scene to build the temporary mesh in.
 */
async function simplifyGeometry(
  positions: Float32Array,
  indices: Uint32Array,
  targetVertices: number,
  scene: Scene
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
 * @param name Name for the decoded geometry.
 * @param data Raw Draco-compressed mesh bytes.
 * @param scene Scene to decode the mesh into.
 */
async function decodeMesh(
  name: string,
  data: ArrayBuffer,
  scene: Scene
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

  // The geometry is registered with the scene, but only its raw arrays are
  // needed here -- dispose it now that they've been copied out.
  geometry.dispose();

  return { positions, indices };
}

/**
 * Flip a flat array of triangle indices' winding order in place.
 *
 * BrainGlobe meshes are wound for a right-handed system, but the scene is
 * left-handed; without this, faces are backface-culled and computed normals
 * point inward.
 * @param indices Flat triangle indices, mutated in place.
 */
function flipIndicesWindingOrder(indices: IndicesArray): void {
  for (let i = 0; i < indices.length; i += 3) {
    const temp = indices[i + 1]!;
    indices[i + 1] = indices[i + 2]!;
    indices[i + 2] = temp;
  }
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
