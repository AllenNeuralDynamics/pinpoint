import {
  type AbstractEngine,
  ImportMeshAsync,
  Mesh,
  Scene
} from "@babylonjs/core";

/**
 * Check that a picked model file holds geometry Babylon's loaders can read.
 * @param engine Engine hosting the throwaway validation scene.
 * @param file Model file picked by the user.
 */
export async function canLoadModelFile(
  engine: AbstractEngine,
  file: File
): Promise<boolean> {
  const scene = new Scene(engine);
  try {
    const result = await ImportMeshAsync(file, scene, {});
    return result.meshes.some(
      mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0
    );
  } finally {
    scene.dispose();
  }
}
