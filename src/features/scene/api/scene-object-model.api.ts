import {
  createStore,
  delMany,
  get,
  keys,
  set,
  type UseStore
} from "idb-keyval";

/** IndexedDB database holding scene object models. */
const DATABASE_NAME = "pinpoint-v";
/**
 * Object store holding one model file per scene object id. The name is
 * historical: `idb-keyval` opens the database without a version, so
 * `onupgradeneeded` never fires for an existing database and a renamed store
 * could never be created.
 */
const STORE_NAME = "scene-object-glb";

/** Lazily created IndexedDB store handle, so importing this module never opens IndexedDB. */
let store: UseStore | null = null;

/** Get, or lazily create, this module's IndexedDB store handle. */
function sceneObjectModelStore(): UseStore {
  store ??= createStore(DATABASE_NAME, STORE_NAME);
  return store;
}

/**
 * Store a scene object's model file in IndexedDB, keyed by its id.
 * @param sceneObjectId Scene object id to store the model under.
 * @param modelFile Model file to store, exactly as the user picked it.
 */
export async function putSceneObjectModel(
  sceneObjectId: string,
  modelFile: File
): Promise<void> {
  await set(sceneObjectId, modelFile, sceneObjectModelStore());
}

/**
 * Read a scene object's model file from IndexedDB, or null when none is stored.
 * @param sceneObjectId Scene object id whose model to read.
 */
export async function getSceneObjectModel(
  sceneObjectId: string
): Promise<File | null> {
  const value = await get<unknown>(sceneObjectId, sceneObjectModelStore());
  return value instanceof File ? value : null;
}

/**
 * Delete every stored model whose scene object id is not referenced, returning
 * the ids that were deleted.
 * @param referencedSceneObjectIds Scene object ids still referenced by any experiment.
 */
export async function pruneSceneObjectModels(
  referencedSceneObjectIds: Iterable<string>
): Promise<string[]> {
  const kept = new Set(referencedSceneObjectIds);
  const storedIds = await keys<string>(sceneObjectModelStore());
  const staleIds = storedIds.filter(id => !kept.has(id));
  if (staleIds.length) await delMany(staleIds, sceneObjectModelStore());
  return staleIds;
}
