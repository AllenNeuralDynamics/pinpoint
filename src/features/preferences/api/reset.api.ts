/** A store whose persisted data the reset panel can clear. */
export interface PersistedStore {
  /** Storage key the store persists under; equal to its Pinia store id. */
  key: string;
  /** i18n key for the store's user-facing name. */
  labelKey: string;
}

/** Every store Pinpoint persists, in the order the reset panel lists them. */
export const PERSISTED_STORES: readonly PersistedStore[] = [
  { key: "current-experiment", labelKey: "preferences.storeCurrentExperiment" },
  { key: "recent-experiments", labelKey: "preferences.storeRecentExperiments" },
  { key: "probe-library", labelKey: "preferences.storeProbeLibrary" },
  { key: "favorite-atlases", labelKey: "preferences.storeFavoriteAtlases" },
  { key: "preferences", labelKey: "preferences.storePreferences" }
];

/**
 * Delete the given stores' persisted data, then reload the app so every store
 * rebuilds from its defaults.
 * @param storage Storage holding the persisted data.
 * @param keys Storage keys to delete.
 * @param reload Callback that reloads the app.
 */
export function resetPersistedStores(
  storage: Storage,
  keys: readonly string[],
  reload: () => void
): void {
  for (const key of keys) storage.removeItem(key);
  reload();
}
