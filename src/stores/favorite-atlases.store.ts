import { defineStore } from "pinia";
import { ref } from "vue";
import type { Atlas } from "@/features/atlas";

export const useFavoriteAtlasesStore = defineStore(
  "favorite-atlases",
  () => {
    /**
     * Favorites mapping. Source URL -> atlas names.
     */
    const favorites = ref<Record<string, string[]>>({});

    /**
     * Add an atlas to its source's favorites list.
     * @param atlas Atlas to add.
     */
    function add(atlas: Atlas) {
      const list = (favorites.value[atlas.source] ??= []);
      if (!list.includes(atlas.name)) {
        list.push(atlas.name);
      }
    }

    /**
     * Remove an atlas from its source's favorites list, if present.
     * @param atlas Atlas to remove.
     */
    function remove(atlas: Atlas) {
      const sourceList = favorites.value[atlas.source];
      if (!sourceList) return;

      const index = sourceList.indexOf(atlas.name);
      if (index !== -1) sourceList.splice(index, 1);
    }

    /**
     * Remove all favorites.
     */
    function reset() {
      favorites.value = {};
    }

    const state = { favorites };
    const actions = { add, remove, reset };
    return { ...state, ...actions };
  },
  { persist: true }
);
