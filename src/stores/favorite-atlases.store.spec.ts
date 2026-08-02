import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useFavoriteAtlasesStore } from "./favorite-atlases.store";
import { makeAtlas } from "@/test/fixtures";

describe("useFavoriteAtlasesStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("add", () => {
    it("creates the source's list on first add", () => {
      const store = useFavoriteAtlasesStore();
      const atlas = makeAtlas({ source: "http://a.com", name: "allen_mouse" });

      store.add(atlas);

      expect(store.favorites["http://a.com"]).toEqual(["allen_mouse"]);
    });

    it("dedups by name within the same source", () => {
      const store = useFavoriteAtlasesStore();
      const atlas = makeAtlas({ source: "http://a.com", name: "allen_mouse" });

      store.add(atlas);
      store.add(atlas);

      expect(store.favorites["http://a.com"]).toEqual(["allen_mouse"]);
    });

    it("keeps distinct names in the same source's list", () => {
      const store = useFavoriteAtlasesStore();

      store.add(makeAtlas({ source: "http://a.com", name: "allen_mouse" }));
      store.add(makeAtlas({ source: "http://a.com", name: "allen_human" }));

      expect(store.favorites["http://a.com"]).toEqual([
        "allen_mouse",
        "allen_human"
      ]);
    });
  });

  describe("remove", () => {
    it("removes the atlas from its source's list", () => {
      const store = useFavoriteAtlasesStore();
      const atlas = makeAtlas({ source: "http://a.com", name: "allen_mouse" });
      store.add(atlas);

      store.remove(atlas);

      expect(store.favorites["http://a.com"]).toEqual([]);
    });

    it("is a no-op when the source doesn't exist", () => {
      const store = useFavoriteAtlasesStore();

      expect(() =>
        store.remove(makeAtlas({ source: "http://missing.com" }))
      ).not.toThrow();
      expect(store.favorites).toEqual({});
    });

    it("is a no-op when the name doesn't exist in the source's list", () => {
      const store = useFavoriteAtlasesStore();
      store.add(makeAtlas({ source: "http://a.com", name: "allen_mouse" }));

      store.remove(makeAtlas({ source: "http://a.com", name: "allen_human" }));

      expect(store.favorites["http://a.com"]).toEqual(["allen_mouse"]);
    });
  });
});
