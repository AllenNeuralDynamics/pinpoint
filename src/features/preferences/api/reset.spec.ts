import { describe, expect, it, vi } from "vitest";
import { PERSISTED_STORES, resetPersistedStores } from "./reset.api";

/**
 * Build a minimal `Storage`-shaped fake backed by a plain map, enough for
 * `resetPersistedStores` to exercise `removeItem`.
 */
function makeFakeStorage(initial: Record<string, string>): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    }
  } as Storage;
}

describe("PERSISTED_STORES", () => {
  it("lists every persisted store's key and label", () => {
    expect(PERSISTED_STORES.map(store => store.key)).toEqual([
      "current-experiment",
      "recent-experiments",
      "probe-library",
      "coordinate-system-library",
      "favorite-atlases",
      "preferences"
    ]);
  });
});

describe("resetPersistedStores", () => {
  it("removes exactly the given keys and then reloads", () => {
    const storage = makeFakeStorage({
      "probe-library": "{}",
      "favorite-atlases": "{}",
      "current-experiment": "{}"
    });
    const removeItemSpy = vi.spyOn(storage, "removeItem");
    const reload = vi.fn();

    resetPersistedStores(
      storage,
      ["probe-library", "favorite-atlases"],
      reload
    );

    expect(removeItemSpy).toHaveBeenCalledWith("probe-library");
    expect(removeItemSpy).toHaveBeenCalledWith("favorite-atlases");
    expect(removeItemSpy).not.toHaveBeenCalledWith("current-experiment");
    expect(storage.getItem("current-experiment")).toBe("{}");
  });

  it("calls reload exactly once, after every removal", () => {
    const storage = makeFakeStorage({ "probe-library": "{}" });
    const calls: string[] = [];
    vi.spyOn(storage, "removeItem").mockImplementation(key => {
      calls.push(`remove:${key}`);
    });
    const reload = vi.fn(() => calls.push("reload"));

    resetPersistedStores(storage, ["probe-library"], reload);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["remove:probe-library", "reload"]);
  });
});
