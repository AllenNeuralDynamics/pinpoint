import type { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { clamp } from "@/utils/math";

/** Initial camera zoom, as a multiple of the atlas's AP length. */
const INITIAL_ZOOM_AP_MULTIPLIER = 1.5;

/** Horizontal magnitude below which a direction counts as straight up or down. */
const ORBIT_POLE_EPSILON = 1e-6;

/**
 * Azimuth used when orbiting straight up or down `DV`, where azimuth is
 * otherwise undefined: matches `+AP`'s, so the camera's roll at the pole is
 * always the same regardless of where it orbited from.
 */
const ORBIT_POLE_ALPHA = -Math.PI / 2;

/**
 * Set the initial zoom of the camera based on the atlas's AP extent.
 * @param camera Camera to set the zoom of.
 * @param apLengthMillimeters Atlas AP extent, in mm.
 */
export function setInitialZoom(
  camera: ArcRotateCamera,
  apLengthMillimeters: number
) {
  if (apLengthMillimeters <= 0) return;

  camera.radius = apLengthMillimeters * INITIAL_ZOOM_AP_MULTIPLIER;
}

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
  const alpha =
    horizontal < ORBIT_POLE_EPSILON
      ? ORBIT_POLE_ALPHA
      : Math.atan2(direction.z, direction.x);
  const beta = Math.acos(clamp(direction.y / length, -1, 1));

  camera.interpolateTo(alpha, beta);
}
