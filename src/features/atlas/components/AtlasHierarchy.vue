<script lang="ts" setup>
import { computed, ref, useTemplateRef, watchPostEffect } from "vue";
import { useFuse } from "@vueuse/integrations/useFuse";
import {
  buildHierarchy,
  HierarchyModel,
  toTitleCase
} from "../api/hierarchy.api";
import { QScrollArea, QTree } from "quasar";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  clearVisibleStructures,
  isStructureVisible,
  setStructureVisibility
} from "@/features/experiment";

const currentExperiment = useCurrentExperimentStore();

const tree = useTemplateRef<QTree>("tree");
const scrollArea = useTemplateRef<QScrollArea>("scroll-area");

const filter = ref<string | null>(null);

/** Root's children from the current atlas's hierarchy. */
const hierarchy = computed(
  () => buildHierarchy(currentExperiment.terminologyRows)?.children ?? []
);

const scrollAreaTarget = computed(() => scrollArea.value?.getScrollTarget());

const searchQuery = computed(() => filter.value ?? "");
const terminologyRows = computed(() => currentExperiment.terminologyRows);
const { results } = useFuse(searchQuery, terminologyRows, {
  fuseOptions: { keys: ["name", "abbreviation"] }
});

const isSearching = computed(() => (filter.value ?? "").trim().length > 0);
const searchResults = computed(() => results.value.map(r => r.item));

// Ensure the tree is always fully expanded.
watchPostEffect(() => {
  if (hierarchy.value.length > 0) {
    tree.value?.expandAll();
  }
});
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
        v-if="isSearching"
        :items="searchResults"
        :scroll-target="scrollAreaTarget"
        dense
      >
        <template #default="{ item: node }">
          <q-item :key="node.identifier" dense>
            <q-item-section side>
              <q-checkbox
                :model-value="
                  isStructureVisible(
                    currentExperiment.experiment,
                    node.identifier
                  )
                "
                dense
                @update:model-value="
                  visible =>
                    setStructureVisibility(
                      currentExperiment.experiment,
                      node.identifier,
                      visible
                    )
                "
              />
            </q-item-section>
            <q-item-section>
              <div class="row items-center q-gutter-x-xs no-wrap">
                <q-icon
                  :style="{ color: node.color_hex_triplet }"
                  name="radio_button_checked"
                />
                <b>{{ node.abbreviation }}</b>
                <span class="text-no-wrap">{{ toTitleCase(node.name) }}</span>
              </div>
            </q-item-section>
          </q-item>
        </template>
      </q-virtual-scroll>
      <q-tree
        v-else
        ref="tree"
        v-model:ticked="currentExperiment.visibleStructures"
        :nodes="hierarchy"
        dense
        no-transition
        node-key="identifier"
        tick-strategy="strict"
      >
        <template #default-header="{ node }">
          <div class="row items-center q-gutter-x-xs no-wrap">
            <q-icon
              :style="{ color: node.color }"
              name="radio_button_checked"
            />
            <b>{{ node.abbreviation }}</b>
            <span class="text-no-wrap">{{ node.name }}</span>
          </div>
        </template>
      </q-tree>
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

<style lang="sass" scoped></style>
