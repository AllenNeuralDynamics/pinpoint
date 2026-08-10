import {
  createStore,
  delMany,
  get,
  keys,
  set,
  type UseStore
} from "idb-keyval";
import type { SceneModel } from "../models/scene-model.model";
import { isFiniteTriple, isRecord } from "@/utils/type-guards";

/** IndexedDB database holding scene models. */
const DATABASE_NAME = "pinpoint-v";
/**
 * Object store holding one model file per scene model id. The name is
 * historical: it predates probe body models and now holds every scene
 * model's file, not just scene objects'. `idb-keyval` opens the database
 * without a version, so `onupgradeneeded` never fires for an existing
 * database and a renamed store could never be created.
 */
const STORE_NAME = "scene-object-glb";

/** Lazily created IndexedDB store handle, so importing this module never opens IndexedDB. */
let store: UseStore | null = null;

/** Get, or lazily create, this module's IndexedDB store handle. */
function sceneModelStore(): UseStore {
  store ??= createStore(DATABASE_NAME, STORE_NAME);
  return store;
}

/**
 * Build a scene model placed at its own origin, unrotated and unscaled.
 * @param modelId Model id, also the key of its file in IndexedDB.
 */
export function buildSceneModel(modelId: string): SceneModel {
  return {
    modelId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
}

/**
 * Check that a value has the shape of a `SceneModel`.
 * @param value Value to check.
 */
export function isSceneModel(value: unknown): value is SceneModel {
  if (!isRecord(value)) return false;

  return (
    typeof value.modelId === "string" &&
    value.modelId.length > 0 &&
    isFiniteTriple(value.position) &&
    isFiniteTriple(value.rotation) &&
    isFiniteTriple(value.scale)
  );
}

/**
 * Store a scene model's file in IndexedDB, keyed by its id.
 * @param modelId Model id to store the file under.
 * @param modelFile Model file to store, exactly as the user picked it.
 */
export async function putSceneModel(
  modelId: string,
  modelFile: File
): Promise<void> {
  await set(modelId, modelFile, sceneModelStore());
}

/**
 * Read a scene model's file from IndexedDB, or null when none is stored.
 * @param modelId Model id whose file to read.
 */
export async function getSceneModel(modelId: string): Promise<File | null> {
  const value = await get<unknown>(modelId, sceneModelStore());
  return value instanceof File ? value : null;
}

/**
 * Delete every stored model whose id is not referenced, returning the ids
 * that were deleted.
 * @param referencedModelIds Model ids still referenced by any experiment.
 */
export async function pruneSceneModels(
  referencedModelIds: Iterable<string>
): Promise<string[]> {
  const kept = new Set(referencedModelIds);
  const storedIds = await keys<string>(sceneModelStore());
  const staleIds = storedIds.filter(id => !kept.has(id));
  if (staleIds.length) await delMany(staleIds, sceneModelStore());
  return staleIds;
}
