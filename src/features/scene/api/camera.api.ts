import type { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import type { Manifest } from "@/features/atlas";
import { clamp } from "@/utils/math";

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

/** Horizontal magnitude below which a direction counts as straight up or down. */
const ORBIT_POLE_EPSILON = 1e-6;

/**
 * Azimuth used when orbiting straight up or down `DV`, where azimuth is
 * otherwise undefined: matches `+AP`'s, so the camera's roll at the pole is
 * always the same regardless of where it orbited from.
 */
const ORBIT_POLE_ALPHA = -Math.PI / 2;

/**
 * Orbit the camera to sit along the given world direction from its target,
 * animating there and leaving its radius and target untouched.
 * @param camera Camera to orbit.
 * @param direction World direction from the target to place the camera along.
 */
export function orbitCameraTowards(
  camera: ArcRotateCamera,
  direction: Vector3
): void {
  const length = direction.length();
  if (length === 0) return;

  const horizontal = Math.hypot(direction.x, direction.z);
  // At the poles the azimuth is undefined, so use a fixed one.
  const alpha =
    horizontal < ORBIT_POLE_EPSILON
      ? ORBIT_POLE_ALPHA
      : Math.atan2(direction.z, direction.x);
  const beta = Math.acos(clamp(direction.y / length, -1, 1));

  camera.interpolateTo(alpha, beta);
}
