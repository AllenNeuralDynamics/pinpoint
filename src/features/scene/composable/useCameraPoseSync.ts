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
import {
  referenceRelativeToWorld,
  worldToReferenceRelative
} from "../api/reference-coordinate.api";

/** Orbit and target the camera and the experiment last agreed on. */
interface SyncedPose {
  orbit: [number, number, number];
  target: [number, number, number];
  worldTarget: Vector3;
}

/**
 * Two-way bind a camera to an experiment's live camera pose: glide the camera
 * to the pose, and write the camera's orbit and target back once it stops.
 * @param camera Camera to bind.
 * @param atlas Getter for the atlas anchoring world space.
 * @param referenceCoordinate Getter for the reference coordinate, in atlas ASR mm.
 * @param pose Getter for the experiment's live camera pose, mutated in place.
 */
export function useCameraPoseSync(
  camera: Readonly<ShallowRef<ArcRotateCamera | null>>,
  atlas: () => Atlas,
  referenceCoordinate: () => [number, number, number],
  pose: () => CameraPose
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
    const worldTarget = referenceRelativeToWorld(
      atlas(),
      referenceCoordinate(),
      target
    );

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
    interpolateCameraToPose(instance, current, worldTarget);
  });

  watch(camera, instance => {
    if (!instance) return;

    const tracker = trackCameraPose(instance, (orbit, worldTarget) => {
      // A camera that only landed where it was sent keeps the pose's own target
      // numbers, so re-deriving them can never drift the stored value.
      const target =
        synced && worldTarget.equals(synced.worldTarget)
          ? synced.target
          : worldToReferenceRelative(
              atlas(),
              referenceCoordinate(),
              worldTarget
            );

      synced = { orbit, target, worldTarget };
      setCameraPose(pose(), orbit, target);
    });
    onWatcherCleanup(() => tracker.dispose());
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
