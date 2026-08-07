import type { AbstractMesh, IndicesArray, Scene } from "@babylonjs/core";
import {
  DracoDecoder,
  Mesh,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData
} from "@babylonjs/core";
import axios from "axios";
import type { Atlas, StructureEntity } from "@/features/atlas";
import { isSameAtlas } from "@/features/atlas";
import { asrToBabylon } from "./coordinate-transforms.api";
import { setMaterialAlpha, setMaterialDiffuseColor } from "./material.api";

/** Decoded structure geometry, in millimeters. */
interface DecodedMeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

/** Atlas a scene's structure meshes were built for, stamped on the atlas root. */
interface AtlasRootMetadata {
  structureAtlas?: Atlas;
}

const ATLAS_ROOT_NODE_NAME = "atlasRoot_node";

/** BrainGlobe v3 Draco meshes store positions in nanometers. */
const NANOMETERS_TO_MILLIMETERS = 1e-6;

/** Suffix applied to a structure's identifier to name its Babylon mesh. */
const STRUCTURE_MESH_SUFFIX = "_structure_mesh";

/** Suffix applied to a structure's identifier to name its Babylon material. */
const STRUCTURE_MATERIAL_SUFFIX = "_structure_material";

/** Alpha applied to a visible structure's material. */
const STRUCTURE_VISIBLE_ALPHA = 1;

/** Alpha applied to a transparent structure's material. */
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
 * Sync the scene's structures, fading the transparent ones instead of
 * removing them.
 * @param scene Scene to sync.
 * @param atlas Atlas the structures belong to.
 * @param fadedStructures Structures to keep in the scene faded out.
 * @param opaqueStructures Structures to draw fully opaque.
 */
export async function syncStructuresVisibility(
  scene: Scene,
  atlas: Atlas,
  fadedStructures: StructureEntity[],
  opaqueStructures: StructureEntity[]
) {
  const atlasRootNode = buildAtlasRootNode(scene);

  // Structure meshes are named by identifier alone and identifiers collide
  // across atlases, so a switch has to drop them all before presence is
  // checked -- otherwise the previous atlas's geometry and colour get reused.
  const metadata = atlasRootNode.metadata as AtlasRootMetadata | null;
  if (
    !metadata?.structureAtlas ||
    !isSameAtlas(metadata.structureAtlas, atlas)
  ) {
    removeAllStructures(scene);
    atlasRootNode.metadata = { ...metadata, structureAtlas: { ...atlas } };
  }

  const presentMeshes = childStructureMeshes(atlasRootNode);

  const opaqueIdentifiers = new Set(
    opaqueStructures.map(({ identifier }) => identifier)
  );

  // Keyed by mesh name so faded-and-opaque structures collapse to one entry
  // and line up with `presentMeshes`.
  const desiredStructures = new Map(
    [...fadedStructures, ...opaqueStructures].map(structure => [
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
    if (!material) continue;

    setMaterialAlpha(
      material,
      opaqueIdentifiers.has(structure.identifier)
        ? STRUCTURE_VISIBLE_ALPHA
        : STRUCTURE_FADED_ALPHA
    );
    // Repaint every pass, as syncProbes does for a probe's colour: a mesh built
    // while the terminology rows still belonged to the previous atlas would
    // otherwise keep that atlas's colour until a page reload.
    if (material instanceof StandardMaterial) {
      setMaterialDiffuseColor(material, structure.color);
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
 * Set whether see-through structures hide their own interior surfaces, using a
 * depth pre-pass so only a transparent structure's outermost surface shades.
 * @param scene Scene whose structure materials to update.
 * @param areHidden Whether interior surfaces are hidden.
 */
export function setStructureInteriorsHidden(
  scene: Scene,
  areHidden: boolean
): void {
  for (const mesh of childStructureMeshes(buildAtlasRootNode(scene)).values()) {
    const material = mesh.material;
    if (!material) continue;

    const needsDepthPrePass =
      areHidden && material.alpha < STRUCTURE_VISIBLE_ALPHA;
    if (material.needDepthPrePass === needsDepthPrePass) continue;

    // Mirrors setMaterialAlpha's skip-when-unchanged, force-rebind pattern
    // for consistency.
    material.needDepthPrePass = needsDepthPrePass;
    material.markDirty(true);
  }
}

/**
 * Clear the structures in the scene.
 * @param scene Scene to clear structures for.
 */
export function removeAllStructures(scene: Scene) {
  const atlasRootNode = buildAtlasRootNode(scene);
  for (const mesh of atlasRootNode.getChildMeshes(true, node =>
    node.name.endsWith(STRUCTURE_MESH_SUFFIX)
  )) {
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
 * Create a structure's hidden placeholder mesh and material, parented under
 * the atlas root.
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
  // Structures are never selectable; excluding them from Babylon's
  // per-triangle pointer pick keeps click latency independent of atlas size.
  mesh.isPickable = false;

  const material = new StandardMaterial(
    `${structure.identifier}${STRUCTURE_MATERIAL_SUFFIX}`,
    scene
  );
  material.diffuseColor = structure.color;
  mesh.material = material;

  return mesh;
}

/**
 * Fetch and decode a structure's mesh geometry, then apply it to its
 * placeholder mesh and reveal it.
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

    const normals = new Float32Array(decoded.positions.length);
    VertexData.ComputeNormals(decoded.positions, decoded.indices, normals);

    const vertexData = new VertexData();
    vertexData.positions = decoded.positions;
    vertexData.normals = normals;
    vertexData.indices = decoded.indices;
    vertexData.applyToMesh(mesh);
    mesh.isVisible = true;
  } catch (error) {
    mesh.dispose(false, true);
    throw error;
  }
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
 * Decode raw Draco mesh data into flat vertex data, in millimeters.
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
 * Flip a flat array of triangle indices' winding order in place.
 * @param indices Flat triangle indices, mutated in place.
 */
function flipIndicesWindingOrder(indices: IndicesArray): void {
  for (let i = 0; i < indices.length; i += 3) {
    const temp = indices[i + 1]!;
    indices[i + 1] = indices[i + 2]!;
    indices[i + 2] = temp;
  }
}
