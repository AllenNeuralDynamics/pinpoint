<script lang="ts" setup>
import { computed, ref } from "vue";
import { useFavoriteAtlasesStore } from "@/stores/favorite-atlases.store";
import { useFuse } from "@vueuse/integrations/useFuse";
import { Atlas } from "../models/atlas.model";
import { listAtlases, listAtlasesHTTP } from "../api/source.api";
import { computedAsync } from "@vueuse/core";

enum SourceToggle {
  BrainGlobe,
  Custom
}

// Props.
const selectedAtlas = defineModel<Atlas | null>({ required: true });

// Composables.
const favoriteAtlasesStore = useFavoriteAtlasesStore();

// State.
const sourceToggle = ref<SourceToggle>(SourceToggle.BrainGlobe);

/**
 * Custom HTTP host URL.
 */
const customHTTPHost = ref<string | null>("http://localhost:3000");

/**
 * Filter string.
 */
const searchQuery = ref<string | null>(null);

const atlasesEvaluating = ref(false);

/**
 * Full list of atlases from the source URL.
 */
const atlases = computedAsync<Atlas[]>(
  async () => {
    if (sourceToggle.value == SourceToggle.BrainGlobe) {
      return (await listAtlases()) ?? [];
    } else {
      if (!customHTTPHost.value) return [];
      return (await listAtlasesHTTP(customHTTPHost.value)) ?? [];
    }
  },
  [],
  atlasesEvaluating
);

// Getters.

/**
 * Null unwrapped search query.
 */
const unwrappedSearchQuery = computed(() => searchQuery.value ?? "");

/**
 * Favorites for this source as a set for fast lookup.
 */
const favoritesSet = computed(() => {
  // Return the source if there are atlases.
  if (atlases.value[0]) {
    const source = atlases.value[0].source;
    return new Set(favoriteAtlasesStore.favorites[source]);
  }

  // Otherwise, return the empty set.
  return new Set<string>();
});

/**
 * Fuzzy finding results.
 */
const { results: atlasFuse } = useFuse(unwrappedSearchQuery, atlases, {
  fuseOptions: { keys: ["name"] }
});

/**
 * Switch between showing all atlases sorted or fuzzy finding results.
 */
const filteredAtlases = computed(() =>
  searchQuery.value
    ? atlasFuse.value.map(result => result.item)
    : [...atlases.value].sort((a, b) => a.name.localeCompare(b.name))
);

/**
 * Favorites from this source.
 */
const filteredFavorites = computed(() =>
  filteredAtlases.value.filter(atlas => favoritesSet.value.has(atlas.name))
);

/**
 * Non-favorite atlases from this source.
 */
const filteredNonFavorites = computed(() =>
  filteredAtlases.value.filter(atlas => !favoritesSet.value.has(atlas.name))
);

/**
 * Compare atlases by identity fields, since instances are not stable references.
 */
function isSelected(atlas: Atlas) {
  return (
    selectedAtlas.value?.source === atlas.source &&
    selectedAtlas.value?.name === atlas.name
  );
}
</script>

<template>
  <q-form class="q-gutter-y-sm">
    <p class="text-h6">{{ $t("atlasPicker.title") }}</p>

    <q-btn-toggle
      v-model="sourceToggle"
      :options="[
        {
          label: $t('atlasPicker.brainglobeHosted'),
          value: SourceToggle.BrainGlobe
        },
        { label: $t('atlasPicker.customHTTPHost'), value: SourceToggle.Custom }
      ]"
      spread
      toggle-color="primary"
    />

    <q-input
      v-if="sourceToggle === SourceToggle.Custom"
      v-model="customHTTPHost"
      :label="$t('atlasPicker.sourceUrl')"
      class="col"
      clearable
    />

    <template v-if="!atlasesEvaluating">
      <template v-if="atlases.length > 0">
        <q-input
          v-model="searchQuery"
          :label="$t('atlasPicker.search')"
          clearable
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
        <p>{{
          $t(
            "atlasPicker.atlasCount",
            { count: filteredAtlases.length },
            filteredAtlases.length
          )
        }}</p>

        <q-list class="dialog-list" separator>
          <q-item
            v-for="atlas in filteredFavorites"
            :key="`${atlas.source}-${atlas.name}`"
            v-ripple
            :active="isSelected(atlas)"
            clickable
            @click="selectedAtlas = atlas"
          >
            <q-item-section>{{ atlas.name }}</q-item-section>
            <q-item-section side>
              <q-btn
                :aria-label="$t('atlasPicker.removeFavorite')"
                color="pink"
                flat
                icon="favorite"
                round
                @click.stop="favoriteAtlasesStore.remove(atlas)"
              />
            </q-item-section>
          </q-item>

          <q-item
            v-for="atlas in filteredNonFavorites"
            :key="`${atlas.source}-${atlas.name}`"
            v-ripple
            :active="isSelected(atlas)"
            clickable
            @click="selectedAtlas = atlas"
          >
            <q-item-section>{{ atlas.name }}</q-item-section>
            <q-item-section side>
              <q-btn
                :aria-label="$t('atlasPicker.addFavorite')"
                flat
                icon="favorite_border"
                round
                @click.stop="favoriteAtlasesStore.add(atlas)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </template>
      <template v-else>
        <p>{{ $t("atlasPicker.noAtlases") }}</p>
        <p class="text-caption">{{ $t("atlasPicker.noAtlasesCaption") }}</p>
      </template>
    </template>
  </q-form>
</template>
