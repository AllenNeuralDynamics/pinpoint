<script lang="ts" setup>
import { computed, onMounted } from "vue";
import type { Atlas, AtlasListing } from "../models/atlas.model";

const props = defineProps<{
  /** Listing this row renders. */
  listing: AtlasListing;
  /** Human-readable atlas name. */
  displayName: string;
  /**
   * Resolved atlas: `undefined` while its manifest is still being fetched,
   * `null` once the fetch failed.
   */
  atlas?: Atlas | null | undefined;
  /** Is this row the picker's current selection. */
  selected: boolean;
  /** Is this atlas favorited for its source. */
  favorite: boolean;
}>();

const emit = defineEmits<{
  request: [listing: AtlasListing];
  select: [listing: AtlasListing];
  toggleFavorite: [listing: AtlasListing];
}>();

/** External page for this atlas, or null while unresolved or unavailable. */
const sourceLink = computed(() => props.atlas?.manifest.atlasLink ?? null);

onMounted(() => emit("request", props.listing));
</script>

<template>
  <q-item
    v-ripple
    :active="selected"
    clickable
    @click="emit('select', listing)"
  >
    <q-item-section>{{ displayName }}</q-item-section>
    <q-item-section side>
      <div class="row no-wrap">
        <q-btn
          v-if="atlas === undefined || sourceLink"
          :aria-label="$t('atlasPicker.openSource')"
          :href="sourceLink ?? undefined"
          :loading="atlas === undefined"
          flat
          icon="link"
          rel="noopener noreferrer"
          round
          target="_blank"
          type="a"
          @click.stop
        />
        <q-btn
          :aria-label="
            $t(
              favorite
                ? 'atlasPicker.removeFavorite'
                : 'atlasPicker.addFavorite'
            )
          "
          :color="favorite ? 'pink' : undefined"
          :icon="favorite ? 'favorite' : 'favorite_border'"
          flat
          round
          @click.stop="emit('toggleFavorite', listing)"
        />
      </div>
    </q-item-section>
  </q-item>
</template>
