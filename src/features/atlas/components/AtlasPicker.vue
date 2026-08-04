<script lang="ts" setup>
import { computed, ref } from "vue";
import { computedAsync } from "@vueuse/core";
import { useFavoriteAtlasesStore } from "@/stores/favorite-atlases.store";
import { useFuzzyFilter } from "@/composable/useFuzzyFilter";
import type { Atlas } from "../models/atlas.model";
import { atlasDisplayName } from "../api/hierarchy.api";
import {
  BRAINGLOBE_BASE_URL,
  isSameAtlas,
  listAtlases,
  listAtlasesHTTP
} from "../api/source.api";

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

const selectedAtlas = defineModel<Atlas | null>({ required: true });

const favoriteAtlasesStore = useFavoriteAtlasesStore();

const sourceToggle = ref<SourceToggle>("brainglobe");
const customHTTPHost = ref<string | null>(null);
const searchQuery = ref<string | null>(null);

const atlasesEvaluating = ref(false);

/** Full list of atlases from the source URL. */
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

/** Root URL of the currently toggled atlas source. */
const source = computed(() =>
  sourceToggle.value === "brainglobe"
    ? BRAINGLOBE_BASE_URL
    : (customHTTPHost.value ?? "")
);

/** Favorites for this source as a set for fast lookup. */
const favoritesSet = computed(
  () => new Set(favoriteAtlasesStore.favorites[source.value])
);

/** Atlases paired with their human-readable display name. */
const atlasOptions = computed<AtlasOption[]>(() =>
  atlases.value.map(atlas => ({
    atlas,
    displayName: atlasDisplayName(atlas.name)
  }))
);

/** Fuzzy finding results, alphabetized when not searching. */
const { filtered: filteredAtlases } = useFuzzyFilter(
  computed(() => searchQuery.value ?? ""),
  atlasOptions,
  { keys: ["displayName"] },
  undefined,
  options =>
    [...options].sort((a, b) => a.displayName.localeCompare(b.displayName))
);

/** Filtered atlases with favorites listed first. */
const orderedAtlasOptions = computed(() => {
  const favorites: AtlasOption[] = [];
  const others: AtlasOption[] = [];
  for (const option of filteredAtlases.value) {
    (favoritesSet.value.has(option.atlas.name) ? favorites : others).push(
      option
    );
  }
  return [...favorites, ...others];
});
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
            v-for="option in orderedAtlasOptions"
            :key="`${option.atlas.source}-${option.atlas.name}`"
            v-ripple
            :active="
              !!selectedAtlas && isSameAtlas(selectedAtlas, option.atlas)
            "
            clickable
            @click="selectedAtlas = option.atlas"
          >
            <q-item-section>{{ option.displayName }}</q-item-section>
            <q-item-section side>
              <q-btn
                :aria-label="
                  $t(
                    favoritesSet.has(option.atlas.name)
                      ? 'atlasPicker.removeFavorite'
                      : 'atlasPicker.addFavorite'
                  )
                "
                :color="
                  favoritesSet.has(option.atlas.name) ? 'pink' : undefined
                "
                :icon="
                  favoritesSet.has(option.atlas.name)
                    ? 'favorite'
                    : 'favorite_border'
                "
                flat
                round
                @click.stop="
                  favoritesSet.has(option.atlas.name)
                    ? favoriteAtlasesStore.remove(option.atlas)
                    : favoriteAtlasesStore.add(option.atlas)
                "
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
