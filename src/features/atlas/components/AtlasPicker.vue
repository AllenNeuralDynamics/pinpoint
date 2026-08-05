<script lang="ts" setup>
import { computed, ref } from "vue";
import { computedAsync } from "@vueuse/core";
import { useFavoriteAtlasesStore } from "@/stores/favorite-atlases.store";
import { useFuzzyFilter } from "@/composable/useFuzzyFilter";
import type { Atlas, AtlasIdentity, AtlasListing } from "../models/atlas.model";
import { atlasDisplayName } from "../api/hierarchy.api";
import {
  BRAINGLOBE_BASE_URL,
  getAtlas,
  isSameAtlas,
  listAtlases,
  listAtlasesHTTP
} from "../api/source.api";
import AtlasPickerItem from "./AtlasPickerItem.vue";

/**
 * Atlas source the picker lists atlases from.
 */
type SourceToggle = "brainglobe" | "custom";

/**
 * An atlas listing paired with its human-readable display name, for
 * sorting, fuzzy search and rendering. The underlying
 * {@link AtlasListing.name} stays snake_case, since it's what source URLs,
 * favorites and selection identity use.
 */
interface AtlasOption {
  listing: AtlasListing;
  displayName: string;
}

/** Row height, matching `q-item`'s default 48px min-height. */
const ITEM_SIZE = 48;

/**
 * Cache key identifying an atlas across sources.
 * @param identity Atlas identity to key.
 */
function atlasKey(identity: AtlasIdentity): string {
  return `${identity.source}\n${identity.name}`;
}

const selectedAtlas = defineModel<Atlas | null>({ required: true });

const favoriteAtlasesStore = useFavoriteAtlasesStore();

const sourceToggle = ref<SourceToggle>("brainglobe");
const customHTTPHost = ref<string | null>(null);
const searchQuery = ref<string | null>(null);

const atlasesEvaluating = ref(false);

/** Full list of atlases from the source URL. */
const atlases = computedAsync<AtlasListing[]>(
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

/** Resolved atlases by cache key; null once a fetch failed. */
const resolvedAtlases = ref(new Map<string, Atlas | null>());

/** One in-flight or settled fetch per atlas, so each is fetched once. */
const atlasRequests = new Map<string, Promise<Atlas | null>>();

/** Selection generation, so a superseded pick can't win the race. */
let selectionRequest = 0;

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

/** Listed atlases, minus any whose manifest turned out to be unfetchable. */
const listedAtlases = computed(() =>
  atlases.value.filter(
    listing => resolvedAtlases.value.get(atlasKey(listing)) !== null
  )
);

/** Listed atlases paired with their human-readable display name. */
const atlasOptions = computed<AtlasOption[]>(() =>
  listedAtlases.value.map(listing => ({
    listing,
    displayName: atlasDisplayName(listing.name)
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
    (favoritesSet.value.has(option.listing.name) ? favorites : others).push(
      option
    );
  }
  return [...favorites, ...others];
});

/**
 * Fetch an atlas's manifest once, caching the result by source and name.
 * @param listing Listing of the atlas to resolve.
 */
function requestAtlas(listing: AtlasListing): Promise<Atlas | null> {
  const key = atlasKey(listing);
  const pending = atlasRequests.get(key);
  if (pending) return pending;

  const request = getAtlas(listing).then(atlas => {
    resolvedAtlases.value.set(key, atlas);
    return atlas;
  });
  atlasRequests.set(key, request);
  return request;
}

/**
 * Select an atlas once its manifest resolves, ignoring picks whose manifest
 * is unfetchable — those atlases drop out of the list instead.
 * @param listing Listing of the atlas the user picked.
 */
async function selectAtlas(listing: AtlasListing): Promise<void> {
  const request = ++selectionRequest;
  const atlas = await requestAtlas(listing);
  if (request !== selectionRequest || !atlas) return;

  selectedAtlas.value = atlas;
}

/**
 * Add or remove an atlas from its source's favorites.
 * @param listing Listing of the atlas to toggle.
 */
function toggleFavorite(listing: AtlasListing): void {
  if (favoritesSet.value.has(listing.name)) {
    favoriteAtlasesStore.remove(listing);
  } else {
    favoriteAtlasesStore.add(listing);
  }
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
      <template v-if="listedAtlases.length > 0">
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

        <q-virtual-scroll
          :items="orderedAtlasOptions"
          :virtual-scroll-item-size="ITEM_SIZE"
          class="fixed-dialog-list"
          separator
        >
          <template #default="{ item }">
            <AtlasPickerItem
              :key="`${item.listing.source}-${item.listing.name}`"
              :atlas="resolvedAtlases.get(atlasKey(item.listing))"
              :display-name="item.displayName"
              :favorite="favoritesSet.has(item.listing.name)"
              :listing="item.listing"
              :selected="
                !!selectedAtlas && isSameAtlas(selectedAtlas, item.listing)
              "
              @request="requestAtlas"
              @select="selectAtlas"
              @toggle-favorite="toggleFavorite"
            />
          </template>
        </q-virtual-scroll>
      </template>
      <template v-else>
        <p>{{ $t("atlasPicker.noAtlases") }}</p>
        <p class="text-caption">{{ $t("atlasPicker.noAtlasesCaption") }}</p>
      </template>
    </template>
  </q-form>
</template>
