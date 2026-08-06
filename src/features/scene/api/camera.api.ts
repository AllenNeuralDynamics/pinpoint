import { Camera } from "@babylonjs/core";
import type { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import type { CameraProjection } from "../models/camera.model";
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
 * Angular tolerance, in radians, within which the camera still counts as
 * looking along an axis. Must exceed `ArcRotateCamera`'s default beta limits
 * of `0.01` / `PI - 0.01`, which stop it from ever reaching a pole exactly.
 */
const AXIS_VIEW_TOLERANCE = 0.02;

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

/**
 * Read the camera's current orbit as alpha/beta in radians and radius in mm.
 * @param camera Camera to read the orbit of.
 */
export function getCameraOrbit(
  camera: ArcRotateCamera
): [number, number, number] {
  return [camera.alpha, camera.beta, camera.radius];
}

/**
 * Animate the camera to an orbit, leaving its target untouched.
 * @param camera Camera to move.
 * @param orbit Alpha/beta in radians and radius in mm to interpolate to.
 */
export function setCameraOrbit(
  camera: ArcRotateCamera,
  orbit: [number, number, number]
): void {
  camera.interpolateTo(orbit[0], orbit[1], orbit[2]);
}

/**
 * Switch the camera between perspective and orthographic, sizing the
 * orthographic frustum from the camera's current radius, vertical field of
 * view, and aspect ratio so the two projections frame the target identically.
 * @param camera Camera to set the projection of.
 * @param projection Projection to render with.
 */
export function applyCameraProjection(
  camera: ArcRotateCamera,
  projection: CameraProjection
): void {
  if (projection === "perspective") {
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    camera.orthoTop = null;
    camera.orthoBottom = null;
    camera.orthoLeft = null;
    camera.orthoRight = null;
    return;
  }

  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  const halfHeight = camera.radius * Math.tan(camera.fov / 2);
  const halfWidth = halfHeight * camera.getEngine().getAspectRatio(camera);
  camera.orthoTop = halfHeight;
  camera.orthoBottom = -halfHeight;
  camera.orthoRight = halfWidth;
  camera.orthoLeft = -halfWidth;
}

/**
 * Whether the camera sits along the given world direction from its target,
 * within the axis-view tolerance.
 * @param camera Camera to test the orbit of.
 * @param direction World direction from the target to test against.
 */
export function isCameraAlignedWith(
  camera: ArcRotateCamera,
  direction: Vector3
): boolean {
  const length = direction.length();
  if (length === 0) return false;

  const sinBeta = Math.sin(camera.beta);
  const dot =
    (Math.cos(camera.alpha) * sinBeta * direction.x +
      Math.cos(camera.beta) * direction.y +
      Math.sin(camera.alpha) * sinBeta * direction.z) /
    length;
  return dot >= Math.cos(AXIS_VIEW_TOLERANCE);
}

/** Handle on an axis-view projection tracker. */
export interface AxisViewProjectionTracker {
  /** Report that the camera has been sent towards this world direction. */
  sendTo: (direction: Vector3) => void;
  /** Detach the tracker from the camera. */
  dispose: () => void;
}

/**
 * Auto-engage orthographic while the camera is parked on an axis view: switch
 * once it settles on an axis it was sent to from perspective, and back once it
 * pitches off that axis.
 * @param camera Camera to track.
 * @param projection Reads the projection the camera currently renders with.
 * @param setProjection Sets the projection to render with.
 */
export function trackAxisViewProjection(
  camera: ArcRotateCamera,
  projection: () => CameraProjection,
  setProjection: (projection: CameraProjection) => void
): AxisViewProjectionTracker {
  /** Axis the camera is travelling towards, until it arrives or is diverted. */
  let pending: Vector3 | null = null;
  /** Axis the camera is parked on with orthographic auto-engaged. */
  let parked: Vector3 | null = null;

  const observer = camera.onAfterCheckInputsObservable.add(() => {
    if (pending) {
      if (camera.isInterpolating) return;

      // A flight the user grabbed mid-transition ends off-axis: only engage
      // orthographic when the camera actually landed on the axis.
      if (isCameraAlignedWith(camera, pending)) {
        setProjection("orthographic");
        parked = pending;
      }
      pending = null;
      return;
    }

    if (parked && !isCameraAlignedWith(camera, parked)) {
      parked = null;
      setProjection("perspective");
    }
  });

  return {
    sendTo: direction => {
      // Orthographic the user chose themselves is theirs to keep; orthographic
      // this tracker engaged still counts as coming from perspective.
      if (projection() === "orthographic" && !parked) return;

      pending = direction.clone();
      parked = null;
    },
    dispose: () => observer.remove()
  };
}
