<script lang="ts" setup>
import { computed, ref, useTemplateRef } from "vue";
import { useFuse } from "@vueuse/integrations/useFuse";
import { QScrollArea } from "quasar";
import { flattenHierarchy } from "../api/hierarchy.api";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  clearVisibleStructures,
  isStructureVisible,
  setStructureVisibility
} from "@/features/experiment";

const currentExperiment = useCurrentExperimentStore();

// Components.
const scrollArea = useTemplateRef<QScrollArea>("scroll-area");

const filter = ref<string | null>(null);

// Expose scroll area target for the virtual scroll.
const scrollAreaTarget = computed(() => scrollArea.value?.getScrollTarget());

// DFS-flattened hierarchy, carrying each row's indent guides.
const items = computed(() =>
  flattenHierarchy(currentExperiment.terminologyRows)
);

// Fuzzy search across the abbreviation (label) and the full name.
const searchQuery = computed(() => filter.value ?? "");
const { results } = useFuse(searchQuery, items, {
  fuseOptions: { keys: ["name", "abbreviation"] }
});

// Search mode: replace hierarchy order with the Fuse-ranked flat order.
const isSearching = computed(() => (filter.value ?? "").trim().length > 0);
const displayedItems = computed(() =>
  isSearching.value ? results.value.map(r => r.item) : items.value
);
</script>

<template>
  <div class="fit column q-gutter-y-sm">
    <q-input v-model="filter" :label="$t('atlasHierarchy.search')" clearable>
      <template #prepend>
        <q-icon name="search" />
      </template>
    </q-input>

    <q-scroll-area ref="scroll-area" class="col">
      <q-virtual-scroll
        :items="displayedItems"
        :virtual-scroll-item-size="32"
        :scroll-target="scrollAreaTarget"
      >
        <template #default="{ item }">
          <div
            :key="item.identifier"
            class="hierarchy-row row items-center no-wrap"
          >
            <template v-if="!isSearching">
              <span
                v-for="(guide, index) in item.guides"
                :key="index"
                class="guide"
                :class="`guide--${guide}`"
              />
            </template>
            <div class="row q-gutter-x-xs items-center">
              <q-checkbox
                :model-value="
                  isStructureVisible(
                    currentExperiment.experiment,
                    item.identifier
                  )
                "
                dense
                @update:model-value="
                  visible =>
                    setStructureVisibility(
                      currentExperiment.experiment,
                      item.identifier,
                      visible
                    )
                "
              />
              <q-icon
                :style="{ color: item.color }"
                name="radio_button_checked"
                size="sm"
              />
              <b>{{ item.abbreviation }}</b>
              <span class="text-no-wrap">{{ item.name }}</span>
            </div>
          </div>
        </template>
      </q-virtual-scroll>
    </q-scroll-area>

    <template v-if="currentExperiment.visibleStructures.length">
      <q-btn
        icon="clear_all"
        :label="$t('atlasHierarchy.clear')"
        @click="clearVisibleStructures(currentExperiment.experiment)"
      />
    </template>
  </div>
</template>

<style lang="sass" scoped>
$guide-width: 2px

.hierarchy-row
  height: 32px
  width: max-content
  min-width: 100%

.guide
  flex: 0 0 1rem
  align-self: stretch
  position: relative

.guide--line::before, .guide--tee::before
  content: ''
  position: absolute
  top: 0
  left: 50%
  height: 100%
  border-left: $guide-width solid $separator-color

.guide--elbow::before
  content: ''
  position: absolute
  top: 0
  left: 50%
  height: 50%
  border-left: $guide-width solid $separator-color

.guide--tee::after, .guide--elbow::after
  content: ''
  position: absolute
  top: 50%
  left: calc(50% + $guide-width / 2)
  width: 50%
  margin-top: -($guide-width * 0.5)
  border-top: $guide-width solid $separator-color

body.body--dark
  .guide--line::before, .guide--tee::before
    border-left-color: $separator-dark-color

  .guide--elbow::before
    border-left-color: $separator-dark-color

  .guide--tee::after, .guide--elbow::after
    border-top-color: $separator-dark-color
</style>
