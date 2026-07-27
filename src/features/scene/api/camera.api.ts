import { ArcRotateCamera } from "@babylonjs/core";
import { Manifest } from "@/features/atlas";

/**
 * Set the initial zoom of the camera based on the dimension of the atlas.
 * @param manifest Atlas manifest which has its dimensions.
 * @param camera Camera to set the zoom of.
 */
export function setInitialZoom(manifest: Manifest, camera: ArcRotateCamera) {
  // Stop if there is no dimensions to pull.
  if (!manifest.resolutions[0] || !manifest.shape[0]) return;

  // Computed as 1.5 * AP length.
  setZoom(manifest.resolutions[0][0] * manifest.shape[0][0] * 1.5, camera);
}

/**
 * Set the zoom of the camera.
 * @param radius Distance from the center point (zoom).
 * @param camera Scene to modify the camera of.
 */
function setZoom(radius: number, camera: ArcRotateCamera) {
  camera.radius = radius;
}
