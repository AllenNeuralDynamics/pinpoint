import { toRaw } from "vue";
import type { SceneObject } from "../models/scene-object.model";
import type { SceneObjectVisibility } from "../models/scene-object-visibility.model";
import type { Experiment } from "@/features/experiment";
import { buildSceneModel, isSceneModel } from "./scene-model.api";
import { STANDARD_COLORS } from "../models/standard-colors.model";
import { isHexColor, isRecord } from "@/utils/type-guards";

/** Every valid scene object visibility, for validating untrusted data. */
const SCENE_OBJECT_VISIBILITIES: readonly string[] = [
  "visible",
  "hidden"
] satisfies readonly SceneObjectVisibility[];

/** Appended to a copied scene object's name. */
const SCENE_OBJECT_COPY_NAME_SUFFIX = " - copy";

/**
 * Build a scene object for a stored GLB, named after its source file, placed
 * at the given position, and given a random color and a fresh scene id.
 * @param modelId Model id of the object's GLB in IndexedDB.
 * @param fileName Name of the model file the object was imported from.
 * @param position Spawn position, in atlas ASR mm as [ap, dv, ml].
 */
export function buildSceneObject(
  modelId: string,
  fileName: string,
  position: [number, number, number]
): SceneObject {
  return {
    ...buildSceneModel(modelId),
    id: crypto.randomUUID(),
    inspectableKind: "sceneObject",
    name: fileName.replace(/\.[^./\\]+$/, "") || fileName,
    color: STANDARD_COLORS[Math.floor(Math.random() * STANDARD_COLORS.length)]!,
    visibility: "visible",
    lock: false,
    collidable: true,
    position: [...position]
  };
}

/**
 * Duplicate a scene object's entry in the experiment with a fresh scene id and a
 * copy-suffixed name, sharing the source's stored model file, returning the copy
 * or null when the object isn't there.
 * @param experiment Experiment holding the scene object entry to duplicate.
 * @param sceneObject Scene object to duplicate.
 */
export function copySceneObject(
  experiment: Experiment,
  sceneObject: SceneObject
): SceneObject | null {
  const index = experiment.sceneObjects.findIndex(
    ({ id }) => id === sceneObject.id
  );
  if (index === -1) return null;

  const copy = structuredClone(toRaw(experiment.sceneObjects[index]!));
  copy.id = crypto.randomUUID();
  copy.name = `${copy.name}${SCENE_OBJECT_COPY_NAME_SUFFIX}`;
  experiment.sceneObjects.splice(index + 1, 0, copy);

  return copy;
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
    isSceneModel(value) &&
    typeof value.name === "string" &&
    isHexColor(value.color) &&
    typeof value.visibility === "string" &&
    SCENE_OBJECT_VISIBILITIES.includes(value.visibility) &&
    typeof value.lock === "boolean" &&
    typeof value.collidable === "boolean"
  );
}
