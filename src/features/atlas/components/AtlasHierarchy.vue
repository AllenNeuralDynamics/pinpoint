<script lang="ts" setup>
import { computed, onMounted, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { useFuzzyFilter } from "@/composable/useFuzzyFilter";
import { useNotify } from "@/composable/useNotify";
import {
  flattenHierarchy,
  getDefaultStructureIdentifiers,
  type HierarchyItem,
  widestHierarchyRowWidth
} from "../api/hierarchy.api";
import { structureEntitiesFromIdentifiers } from "../api/source.api";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  getVisibleStructure,
  isStructureVisible,
  resetStructureVisibility,
  setStructureVisibility
} from "@/features/experiment";
import {
  getStructureHemisphereCenters,
  type Hemisphere,
  type HemisphereCenters,
  moveInspectableToMillimeters,
  useBabylonRuntimeService
} from "@/features/scene";

/** Width of one indent guide cell, matching `.guide`'s `flex: 0 0 1rem`. */
const GUIDE_WIDTH = 16;

/**
 * Checkbox (20px dense) + colour icon (24px at `size="sm"`) + the row's
 * `q-gutter-x-xs` gaps (four 4px child margins less the parent's -4px).
 */
const ROW_CHROME_WIDTH = 56;

const measurementContext = document.createElement("canvas").getContext("2d");

const currentExperiment = useCurrentExperimentStore();
const { t } = useI18n();
const { notifyWarning } = useNotify();
const runtime = useBabylonRuntimeService();

const filter = ref<string | null>(null);
const root = useTemplateRef<HTMLDivElement>("root");
const fontsReady = ref(false);
const enabledOnly = ref(false);

/**
 * Region the selection was last moved into, holding both hemisphere centers so the
 * right/left toggle never refetches the mesh.
 */
const lastRegionMove = ref<{
  identifier: number;
  hemisphere: Hemisphere;
  centers: HemisphereCenters;
} | null>(null);

const items = computed(() =>
  flattenHierarchy(currentExperiment.terminologyRows)
);

// Filtering ahead of Fuse narrows both the hierarchy-ordered list and the
// search results, and keeps hierarchy order while not searching. A transparent
// (indeterminate) structure is not enabled.
const searchableItems = computed(() =>
  enabledOnly.value
    ? items.value.filter(item =>
        isStructureVisible(currentExperiment.experiment, item.identifier)
      )
    : items.value
);

// Fuzzy search across the abbreviation (label) and the full name. A
// whitespace-only filter is treated as blank, keeping the hierarchy order.
const { isSearching, filtered: displayedItems } = useFuzzyFilter(
  computed(() => filter.value ?? ""),
  searchableItems,
  { keys: ["name", "abbreviation"] },
  query => query.trim().length === 0
);

/** Indent guides only apply to the full hierarchy-ordered list. */
const showGuides = computed(() => !isSearching.value && !enabledOnly.value);

const defaultStructureIdentifiers = computed(() =>
  getDefaultStructureIdentifiers(
    currentExperiment.atlas.name,
    currentExperiment.terminologyRows
  )
);

/**
 * Whether any structure differs from the atlas's all-transparent default, i.e.
 * whether Clear has anything to reset.
 */
const hasStructureChanges = computed(
  () =>
    currentExperiment.visibleStructures.length !==
      defaultStructureIdentifiers.value.length ||
    currentExperiment.visibleStructures.some(
      ({ id, isTransparent }) =>
        !isTransparent || !defaultStructureIdentifiers.value.includes(id)
    )
);

/**
 * Can a row click move the selection: something with a position is selected, and a
 * selected probe is not locked against pose edits.
 */
const canMoveToRegion = computed(() => {
  const selected = currentExperiment.selectedInspectable;
  if (
    !selected ||
    selected.inspectableKind === "world" ||
    selected.inspectableKind === "coordinateSystem"
  ) {
    return false;
  }
  return selected.inspectableKind === "camera" || !selected.lock;
});

const contentWidth = computed(() => {
  if (!fontsReady.value || !root.value) return 0;
  return widestHierarchyRowWidth(
    displayedItems.value,
    {
      guideWidth: showGuides.value ? GUIDE_WIDTH : 0,
      chromeWidth: ROW_CHROME_WIDTH
    },
    makeTextMeasurer(root.value)
  );
});

/**
 * Move the selected inspectable to a region's geometric center, alternating right
 * then left hemisphere across repeat clicks of the same region.
 * @param item Hierarchy row that was clicked.
 */
async function moveToRegionCenter(item: HierarchyItem): Promise<void> {
  if (!canMoveToRegion.value || currentExperiment.isLoadingRegionCenter) return;

  const previous = lastRegionMove.value;
  const isSameRegion = previous?.identifier === item.identifier;
  const hemisphere: Hemisphere =
    isSameRegion && previous.hemisphere === "right" ? "left" : "right";

  let centers = isSameRegion ? previous.centers : null;
  if (!centers) {
    const scene = runtime.scene.value;
    const structure = structureEntitiesFromIdentifiers(
      currentExperiment.atlas,
      currentExperiment.terminologyRows,
      [item.identifier]
    )[0];
    if (!scene || !structure) return;

    // Set before the first await so the scene canvas loading bar shows immediately.
    currentExperiment.isLoadingRegionCenter = true;
    try {
      centers = await getStructureHemisphereCenters(
        scene,
        currentExperiment.atlas,
        structure
      );
    } catch {
      notifyWarning(
        t("atlasHierarchy.regionMeshUnavailable"),
        t("atlasHierarchy.regionMeshUnavailableCaption")
      );
      return;
    } finally {
      currentExperiment.isLoadingRegionCenter = false;
    }
  }

  // Recorded even when that hemisphere is empty, so the next click tries the other one.
  lastRegionMove.value = { identifier: item.identifier, hemisphere, centers };

  const center = centers[hemisphere];
  if (!center) {
    notifyWarning(
      t("atlasHierarchy.regionCenterUnavailable"),
      t("atlasHierarchy.regionCenterUnavailableCaption", { name: item.name })
    );
    return;
  }

  // The selection can change while the mesh downloads, so re-read it here.
  const selected = currentExperiment.selectedInspectable;
  if (!selected || !canMoveToRegion.value) return;

  moveInspectableToMillimeters(selected, center);
}

/**
 * Handle a row click.
 * @param item Hierarchy row that was clicked.
 */
function onRowClick(item: HierarchyItem): void {
  void moveToRegionCenter(item);
}

/**
 * Checkbox state for a structure: checked when opaque, indeterminate when
 * transparent, unchecked when not shown.
 * @param identifier Structure identifier.
 */
function structureCheckboxValue(identifier: number): boolean | null {
  const visibleStructure = getVisibleStructure(
    currentExperiment.experiment,
    identifier
  );
  if (!visibleStructure) return false;
  return visibleStructure.isTransparent ? null : true;
}

/**
 * Build a canvas-backed text measurer using the list's own font.
 * @param element Element to read the rendered font from.
 */
function makeTextMeasurer(element: HTMLElement) {
  const { fontSize, fontFamily } = getComputedStyle(element);
  const boldFont = `700 ${fontSize} ${fontFamily}`;
  const regularFont = `400 ${fontSize} ${fontFamily}`;
  return (text: string, bold: boolean): number => {
    if (!measurementContext) return 0;
    measurementContext.font = bold ? boldFont : regularFont;
    return measurementContext.measureText(text).width;
  };
}

onMounted(async () => {
  // Measuring before the webfont lands yields fallback metrics that are too
  // narrow.
  await document.fonts?.ready;
  fontsReady.value = true;
});
</script>

<template>
  <div ref="root" class="column full-height q-gutter-y-sm">
    <q-input v-model="filter" :label="$t('atlasHierarchy.search')" clearable>
      <template #prepend>
        <q-icon name="search" />
      </template>
    </q-input>
    <q-toggle
      v-model="enabledOnly"
      :label="$t('atlasHierarchy.enabledOnly')"
      dense
    />

    <q-virtual-scroll
      :items="displayedItems"
      :style="{ '--hierarchy-content-width': `${contentWidth}px` }"
      :virtual-scroll-item-size="32"
      class="col scroll"
    >
      <template #default="{ item }">
        <div
          :key="item.identifier"
          v-ripple="canMoveToRegion"
          :class="{ 'hierarchy-row--clickable': canMoveToRegion }"
          class="hierarchy-row row items-center no-wrap"
          @click="onRowClick(item)"
        >
          <template v-if="showGuides">
            <span
              v-for="(guide, index) in item.guides"
              :key="index"
              :class="`guide--${guide}`"
              class="guide"
            />
          </template>
          <div class="row q-gutter-x-xs items-center no-wrap">
            <q-checkbox
              :model-value="structureCheckboxValue(item.identifier)"
              :toggle-indeterminate="
                defaultStructureIdentifiers.includes(item.identifier)
              "
              dense
              @update:model-value="
                value =>
                  setStructureVisibility(
                    currentExperiment.experiment,
                    item.identifier,
                    value
                  )
              "
            />
            <q-icon
              :style="{ color: item.color }"
              name="radio_button_checked"
              size="sm"
            />
            <b class="text-no-wrap">{{ item.abbreviation }}</b>
            <span class="text-no-wrap">{{ item.name }}</span>
          </div>
        </div>
      </template>
    </q-virtual-scroll>

    <q-btn
      v-if="hasStructureChanges"
      icon="clear_all"
      :label="$t('atlasHierarchy.clear')"
      @click="
        resetStructureVisibility(
          currentExperiment.experiment,
          defaultStructureIdentifiers
        )
      "
    />
  </div>
</template>

<style lang="sass" scoped>
$guide-width: 2px

.column
  flex-wrap: nowrap

.hierarchy-row
  height: 32px

.hierarchy-row--clickable
  position: relative
  overflow: hidden
  cursor: pointer

  &:hover
    background-color: rgba(0, 0, 0, 0.04)

// Quasar's virtual-scroll content wrapper is `contain: content`, which
// paint-clips rows wider than the panel. Sizing it to the widest row in the
// whole list moves that overflow onto the scrolling root and keeps the
// scrollable width constant as rows mount and unmount.
:deep(.q-virtual-scroll__content)
  width: var(--hierarchy-content-width)
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

  .hierarchy-row--clickable:hover
    background-color: rgba(255, 255, 255, 0.07)
</style>
