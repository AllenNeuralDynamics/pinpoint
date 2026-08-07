import type { SceneObject } from "../models/scene-object.model";
import type { SceneObjectVisibility } from "../models/scene-object-visibility.model";
import { STANDARD_COLORS } from "../models/standard-colors.model";
import { isFiniteTriple, isHexColor, isRecord } from "@/utils/type-guards";

/** Every valid scene object visibility, for validating untrusted data. */
const SCENE_OBJECT_VISIBILITIES: readonly string[] = [
  "visible",
  "hidden"
] satisfies readonly SceneObjectVisibility[];

/**
 * Build a scene object for a stored GLB, named after its source file and given a
 * random color.
 * @param id Scene object id, also the key of its GLB in IndexedDB.
 * @param fileName Name of the model file the object was imported from.
 */
export function buildSceneObject(id: string, fileName: string): SceneObject {
  return {
    inspectableKind: "sceneObject",
    id,
    name: fileName.replace(/\.[^./\\]+$/, "") || fileName,
    color: STANDARD_COLORS[Math.floor(Math.random() * STANDARD_COLORS.length)]!,
    visibility: "visible",
    lock: false,
    collidable: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
}

/**
 * Toggle whether a scene object's body participates in collision detection.
 * @param sceneObject Scene object to toggle collision detection for.
 */
export function toggleSceneObjectCollidable(sceneObject: SceneObject) {
  sceneObject.collidable = !sceneObject.collidable;
}

/**
 * Toggle a scene object's mesh between shown and hidden.
 * @param sceneObject Scene object to change the visibility of.
 */
export function toggleSceneObjectVisibility(sceneObject: SceneObject) {
  sceneObject.visibility =
    sceneObject.visibility === "visible" ? "hidden" : "visible";
}

/**
 * Toggle whether a scene object is locked against pose edits.
 * @param sceneObject Scene object to toggle the lock of.
 */
export function toggleSceneObjectLock(sceneObject: SceneObject) {
  sceneObject.lock = !sceneObject.lock;
}

/**
 * Check that a value has the shape of a `SceneObject`.
 * @param value Value to check.
 */
export function isSceneObject(value: unknown): value is SceneObject {
  if (!isRecord(value)) return false;

  return (
    value.inspectableKind === "sceneObject" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    isHexColor(value.color) &&
    typeof value.visibility === "string" &&
    SCENE_OBJECT_VISIBILITIES.includes(value.visibility) &&
    typeof value.lock === "boolean" &&
    typeof value.collidable === "boolean" &&
    isFiniteTriple(value.position) &&
    isFiniteTriple(value.rotation) &&
    isFiniteTriple(value.scale)
  );
}
