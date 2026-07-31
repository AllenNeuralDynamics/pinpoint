import type { ArcRotateCamera } from "@babylonjs/core";
import type { Manifest } from "@/features/atlas";

/** Initial camera zoom, as a multiple of the atlas's AP length. */
const INITIAL_ZOOM_AP_MULTIPLIER = 1.5;

/**
 * Set the initial zoom of the camera based on the dimension of the atlas.
 * @param camera Camera to set the zoom of.
 * @param manifest Atlas manifest which has its dimensions.
 */
export function setInitialZoom(camera: ArcRotateCamera, manifest: Manifest) {
  if (!manifest.resolutions[0] || !manifest.shape[0]) return;

  camera.radius =
    manifest.resolutions[0][0] *
    manifest.shape[0][0] *
    INITIAL_ZOOM_AP_MULTIPLIER;
}
