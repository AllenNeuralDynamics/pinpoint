import { Camera } from "@babylonjs/core";
import type { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import type { CameraPose } from "@/features/experiment";
import type { CameraProjection } from "../models/camera.model";
import { clamp } from "@/utils/math";

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
function getCameraOrbit(camera: ArcRotateCamera): [number, number, number] {
  return [camera.alpha, camera.beta, camera.radius];
}

/**
 * Place the camera at a pose's orbit and world target immediately, cancelling
 * any glide in flight.
 * @param camera Camera to place.
 * @param pose Camera pose to place the camera at.
 * @param worldTarget Pose's target in Babylon world space.
 */
export function snapCameraToPose(
  camera: ArcRotateCamera,
  pose: CameraPose,
  worldTarget: Vector3
): void {
  camera.stopInterpolation();
  camera.alpha = pose.alpha;
  camera.beta = pose.beta;
  camera.radius = pose.radius;
  // `cloneAlphaBetaRadius: true` keeps the angles/radius just set above --
  // `setTarget`'s default recomputes them from the vector between the
  // camera's pre-existing position and the new target instead.
  camera.setTarget(worldTarget, false, false, true);
}

/**
 * Glide the camera to a pose's orbit and world target.
 * @param camera Camera to move.
 * @param pose Camera pose to interpolate to.
 * @param worldTarget Pose's target in Babylon world space.
 */
export function interpolateCameraToPose(
  camera: ArcRotateCamera,
  pose: CameraPose,
  worldTarget: Vector3
): void {
  camera.interpolateTo(pose.alpha, pose.beta, pose.radius, worldTarget);
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

/** Handle on a camera pose tracker. */
export interface CameraPoseTracker {
  /** Detach the tracker from the camera. */
  dispose: () => void;
}

/**
 * Report the camera's orbit and world target as it moves, and again once it
 * stops, so a drag, a zoom, or a glide yields one report per moved frame plus
 * one report when it settles.
 * @param camera Camera to track.
 * @param onMove Called with the orbit and world target on every frame the camera moved.
 * @param onSettle Called with the orbit and world target on the first still frame after a movement.
 */
export function trackCameraPose(
  camera: ArcRotateCamera,
  onMove: (orbit: [number, number, number], worldTarget: Vector3) => void,
  onSettle: (orbit: [number, number, number], worldTarget: Vector3) => void
): CameraPoseTracker {
  /** Orbit and target seen on the previous frame, or null before the first. */
  let previousOrbit: [number, number, number] | null = null;
  let previousTarget: Vector3 | null = null;
  /** Has the camera moved since the last report. */
  let hasMoved = false;

  const observer = camera.onAfterCheckInputsObservable.add(() => {
    const orbit = getCameraOrbit(camera);
    const isStill =
      !!previousOrbit &&
      !!previousTarget &&
      orbit[0] === previousOrbit[0] &&
      orbit[1] === previousOrbit[1] &&
      orbit[2] === previousOrbit[2] &&
      camera.target.equals(previousTarget);
    previousOrbit = orbit;
    previousTarget = camera.target.clone();

    if (!isStill) {
      hasMoved = true;
      onMove(orbit, camera.target.clone());
      return;
    }
    // Inertia and interpolation both keep changing the orbit frame to frame, so
    // a still frame with nothing in flight is the end of the whole movement.
    if (!hasMoved || camera.isInterpolating) return;

    hasMoved = false;
    onSettle(orbit, camera.target.clone());
  });

  return { dispose: () => observer.remove() };
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
