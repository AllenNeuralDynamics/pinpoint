import { setCameraPose } from "@/features/experiment";
import { setProbeTipMillimeters } from "@/features/probe";
import type { Inspectable } from "../models/inspectable.model";

/**
 * Is `a` the same inspectable entity as `b`.
 * @param a First entity to compare.
 * @param b Second entity to compare.
 */
export function isSameInspectable(a: Inspectable, b: Inspectable): boolean {
  if (a.inspectableKind !== b.inspectableKind) return false;
  // The scene has exactly one camera and one world, so any two of either match.
  // Checking both narrows `a` and `b` to `Probe | SceneObject` below.
  if (
    a.inspectableKind === "camera" ||
    a.inspectableKind === "world" ||
    b.inspectableKind === "camera" ||
    b.inspectableKind === "world"
  ) {
    return true;
  }
  return a.id === b.id;
}

/**
 * Move an inspectable onto a point in atlas ASR mm: a probe's tip, a scene
 * object's origin, or the camera's orbit target with its orbit left alone.
 * The world and coordinate systems have no position, so they are left alone too.
 * @param inspectable Inspectable to move, mutated in place.
 * @param atlasMillimeters Destination, in atlas ASR mm.
 */
export function moveInspectableToMillimeters(
  inspectable: Inspectable,
  atlasMillimeters: [number, number, number]
): void {
  // The world and a coordinate system have no position to move.
  if (
    inspectable.inspectableKind === "world" ||
    inspectable.inspectableKind === "coordinateSystem"
  ) {
    return;
  }

  if (inspectable.inspectableKind === "camera") {
    setCameraPose(
      inspectable,
      [inspectable.alpha, inspectable.beta, inspectable.radius],
      atlasMillimeters
    );
    return;
  }

  if (inspectable.inspectableKind === "sceneObject") {
    inspectable.position = [...atlasMillimeters];
    return;
  }

  setProbeTipMillimeters(inspectable, atlasMillimeters);
}
