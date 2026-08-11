import type { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import type { ShallowRef } from "vue";
import { onWatcherCleanup, watch, watchEffect } from "vue";
import type { Atlas } from "@/features/atlas";
import type { CameraPose } from "@/features/experiment";
import { setCameraPose } from "@/features/experiment";
import {
  interpolateCameraToPose,
  snapCameraToPose,
  trackCameraPose
} from "../api/camera.api";
import { atlasToWorld, worldToAtlas } from "../api/coordinate-transforms.api";

/** Orbit and target the camera and the experiment last agreed on. */
interface SyncedPose {
  orbit: [number, number, number];
  target: [number, number, number];
  worldTarget: Vector3;
}

/**
 * Two-way bind a camera to an experiment's live camera pose: glide the camera
 * to the pose, and write the camera's orbit and target back as it moves.
 * @param camera Camera to bind.
 * @param atlas Getter for the atlas anchoring world space.
 * @param pose Getter for the experiment's live camera pose, mutated in place.
 * @param shouldSnap Getter for whether a pose change should be applied immediately instead of glided to.
 * @param onPoseMoving Called after each live write of a moving camera's pose.
 * @param onPoseSettled Called once the camera has stopped moving.
 */
export function useCameraPoseSync(
  camera: Readonly<ShallowRef<ArcRotateCamera | null>>,
  atlas: () => Atlas,
  pose: () => CameraPose,
  shouldSnap: () => boolean,
  onPoseMoving: () => void,
  onPoseSettled: () => void
): void {
  let synced: SyncedPose | null = null;

  // A fresh camera snaps, so it doesn't fly in from the runtime's construction
  // values; afterwards it glides.
  watch(camera, () => {
    synced = null;
  });

  watchEffect(() => {
    const instance = camera.value;
    if (!instance) return;

    const current = pose();
    const orbit: [number, number, number] = [
      current.alpha,
      current.beta,
      current.radius
    ];
    const target: [number, number, number] = [...current.target];
    const worldTarget = atlasToWorld(atlas(), target);

    if (!synced) {
      synced = { orbit, target, worldTarget };
      snapCameraToPose(instance, current, worldTarget);
      return;
    }
    // The readback below writes what the camera already shows; moving the
    // camera for it would bounce it against itself every settle.
    if (
      isSameTriple(orbit, synced.orbit) &&
      isSameTriple(target, synced.target)
    ) {
      return;
    }

    synced = { orbit, target, worldTarget };
    if (shouldSnap()) snapCameraToPose(instance, current, worldTarget);
    else interpolateCameraToPose(instance, current, worldTarget);
  });

  watch(camera, instance => {
    if (!instance) return;

    /**
     * Write the camera's orbit and target onto the pose, reporting whether it
     * held anything the pose did not already have.
     * @param orbit Camera's current alpha/beta/radius.
     * @param worldTarget Camera's current target, in Babylon world space.
     */
    function applyCameraPose(
      orbit: [number, number, number],
      worldTarget: Vector3
    ): boolean {
      const isSameWorldTarget =
        !!synced && worldTarget.equals(synced.worldTarget);
      if (synced && isSameWorldTarget && isSameTriple(orbit, synced.orbit)) {
        return false;
      }

      // A camera that only landed where it was sent keeps the pose's own target
      // numbers, so re-deriving them can never drift the stored value.
      const target =
        synced && isSameWorldTarget
          ? synced.target
          : worldToAtlas(atlas(), worldTarget);

      synced = { orbit, target, worldTarget };
      setCameraPose(pose(), orbit, target);
      return true;
    }

    const tracker = trackCameraPose(
      instance,
      (orbit, worldTarget) => {
        // A camera gliding to a pose the experiment already holds has nothing to
        // report, and streaming its in-between frames back would overwrite the
        // pose that sent it there.
        if (instance.isInterpolating) return;
        if (applyCameraPose(orbit, worldTarget)) onPoseMoving();
      },
      (orbit, worldTarget) => {
        applyCameraPose(orbit, worldTarget);
        onPoseSettled();
      }
    );
    onWatcherCleanup(() => {
      tracker.dispose();
      // A camera swapped out mid-movement would otherwise leave the store's
      // history suppressed for the rest of the session.
      onPoseSettled();
    });
  });
}

/**
 * Are two numeric triples equal element by element.
 * @param a First triple to compare.
 * @param b Second triple to compare.
 */
function isSameTriple(
  a: [number, number, number],
  b: [number, number, number]
): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
