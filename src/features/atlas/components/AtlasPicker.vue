<script lang="ts" setup>
import { computed, ref } from "vue";
import { computedAsync } from "@vueuse/core";
import { useFavoriteAtlasesStore } from "@/stores/favorite-atlases.store";
import { useFuzzyFilter } from "@/composable/useFuzzyFilter";
import { Atlas } from "../models/atlas.model";
import { atlasDisplayName } from "../api/hierarchy.api";
import { listAtlases, listAtlasesHTTP } from "../api/source.api";

/**
 * Atlas source the picker lists atlases from.
 */
type SourceToggle = "brainglobe" | "custom";

/**
 * An atlas paired with its human-readable display name, for sorting, fuzzy
 * search and rendering. The underlying {@link Atlas.name} stays snake_case,
 * since it's what source URLs, favorites and selection identity use.
 */
interface AtlasOption {
  atlas: Atlas;
  displayName: string;
}

// Props.
const selectedAtlas = defineModel<Atlas | null>({ required: true });

const favoriteAtlasesStore = useFavoriteAtlasesStore();

const sourceToggle = ref<SourceToggle>("brainglobe");
const customHTTPHost = ref<string | null>("http://localhost:3000");
const searchQuery = ref<string | null>(null);

const atlasesEvaluating = ref(false);

/**
 * Full list of atlases from the source URL.
 */
const atlases = computedAsync<Atlas[]>(
  async () => {
    if (sourceToggle.value === "brainglobe") {
      return (await listAtlases()) ?? [];
    } else {
      if (!customHTTPHost.value) return [];
      return (await listAtlasesHTTP(customHTTPHost.value)) ?? [];
    }
  },
  [],
  atlasesEvaluating
);

/**
 * Favorites for this source as a set for fast lookup.
 */
const favoritesSet = computed(() => {
  if (atlases.value[0]) {
    const source = atlases.value[0].source;
    return new Set(favoriteAtlasesStore.favorites[source]);
  }

  return new Set<string>();
});

/**
 * Atlases paired with their human-readable display name.
 */
const atlasOptions = computed<AtlasOption[]>(() =>
  atlases.value.map(atlas => ({
    atlas,
    displayName: atlasDisplayName(atlas.name)
  }))
);

/**
 * Fuzzy finding results, alphabetized when not searching.
 */
const { filtered: filteredAtlases } = useFuzzyFilter(
  computed(() => searchQuery.value ?? ""),
  atlasOptions,
  { keys: ["displayName"] },
  undefined,
  options =>
    [...options].sort((a, b) => a.displayName.localeCompare(b.displayName))
);

/**
 * Favorites from this source.
 */
const filteredFavorites = computed(() =>
  filteredAtlases.value.filter(option =>
    favoritesSet.value.has(option.atlas.name)
  )
);

/**
 * Non-favorite atlases from this source.
 */
const filteredNonFavorites = computed(() =>
  filteredAtlases.value.filter(
    option => !favoritesSet.value.has(option.atlas.name)
  )
);

/**
 * Compare atlases by identity fields, since instances are not stable references.
 */
function isSelected(atlas: Atlas): boolean {
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
        { label: $t('atlasPicker.brainglobeHosted'), value: 'brainglobe' },
        { label: $t('atlasPicker.customHTTPHost'), value: 'custom' }
      ]"
      spread
      toggle-color="primary"
    />

    <q-input
      v-if="sourceToggle === 'custom'"
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

        <q-list class="fixed-dialog-list" separator>
          <q-item
            v-for="option in filteredFavorites"
            :key="`${option.atlas.source}-${option.atlas.name}`"
            v-ripple
            :active="isSelected(option.atlas)"
            clickable
            @click="selectedAtlas = option.atlas"
          >
            <q-item-section>{{ option.displayName }}</q-item-section>
            <q-item-section side>
              <q-btn
                :aria-label="$t('atlasPicker.removeFavorite')"
                color="pink"
                flat
                icon="favorite"
                round
                @click.stop="favoriteAtlasesStore.remove(option.atlas)"
              />
            </q-item-section>
          </q-item>

          <q-item
            v-for="option in filteredNonFavorites"
            :key="`${option.atlas.source}-${option.atlas.name}`"
            v-ripple
            :active="isSelected(option.atlas)"
            clickable
            @click="selectedAtlas = option.atlas"
          >
            <q-item-section>{{ option.displayName }}</q-item-section>
            <q-item-section side>
              <q-btn
                :aria-label="$t('atlasPicker.addFavorite')"
                flat
                icon="favorite_border"
                round
                @click.stop="favoriteAtlasesStore.add(option.atlas)"
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
