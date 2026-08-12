<script lang="ts" setup>
import { useQuasar } from "quasar";
import { openPreferencesDialog } from "@/features/preferences";
import { STANDARD_COLORS } from "@/features/scene";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  DEFAULT_WORLD_BACKGROUND_COLOR_DARK,
  DEFAULT_WORLD_BACKGROUND_COLOR_LIGHT,
  usePreferencesStore
} from "@/stores/preferences.store";

/**
 * Standard palette plus the light-mode default background and pure white, so
 * both stay pickable in light mode. Quasar lays palette swatches out ten to a
 * row, so the length must stay a multiple of ten or the row's leftover cells
 * read as dead swatches.
 */
const LIGHT_MODE_COLOR_PALETTE = [
  ...STANDARD_COLORS,
  DEFAULT_WORLD_BACKGROUND_COLOR_LIGHT,
  "#ffffff"
];

/** Same as the light-mode palette, but with the dark surfaces in place. */
const DARK_MODE_COLOR_PALETTE = [
  ...STANDARD_COLORS,
  DEFAULT_WORLD_BACKGROUND_COLOR_DARK,
  "#000000"
];

const $q = useQuasar();
const currentExperiment = useCurrentExperimentStore();
const preferences = usePreferencesStore();

/** Close the world inspector and reopen the preferences dialog on its scene tab. */
function returnToPreferences(): void {
  currentExperiment.selectedInspectable = null;
  openPreferencesDialog($q, "scene");
}
</script>

<template>
  <div class="column q-gutter-y-md">
    <div>
      <div class="text-body2 q-pb-xs">{{
        $t("worldInspector.backgroundColorLightMode")
      }}</div>
      <q-color
        v-model="preferences.worldBackgroundColorLightMode"
        class="world-inspector__color"
        :palette="LIGHT_MODE_COLOR_PALETTE"
        default-view="palette"
      />
    </div>
    <div>
      <div class="text-body2 q-pb-xs">{{
        $t("worldInspector.backgroundColorDarkMode")
      }}</div>
      <q-color
        v-model="preferences.worldBackgroundColorDarkMode"
        class="world-inspector__color"
        :palette="DARK_MODE_COLOR_PALETTE"
        default-view="palette"
      />
    </div>
    <q-separator />
    <div>
      <div class="text-body2 q-pb-xs">{{
        $t("worldInspector.lightPower")
      }}</div>
      <q-slider
        v-model="preferences.worldLightIntensity"
        :aria-label="$t('worldInspector.lightPower')"
        :min="0"
        :max="2"
        :step="0.05"
        label
      />
    </div>
    <div>
      <div class="text-body2 q-pb-xs">{{
        $t("worldInspector.specularIntensity")
      }}</div>
      <q-slider
        v-model="preferences.materialSpecularIntensity"
        :aria-label="$t('worldInspector.specularIntensity')"
        :min="0"
        :max="1"
        :step="0.05"
        label
      />
    </div>
    <div>
      <div class="text-body2 q-pb-xs">{{
        $t("worldInspector.specularPower")
      }}</div>
      <q-slider
        v-model="preferences.materialSpecularPower"
        :aria-label="$t('worldInspector.specularPower')"
        :min="1"
        :max="128"
        :step="1"
        label
      />
    </div>
    <q-separator />
    <q-toggle
      v-model="preferences.isSsaoEnabled"
      :label="$t('worldInspector.ambientOcclusion')"
    />
    <q-btn
      class="full-width"
      color="primary"
      :label="$t('worldInspector.backToPreferences')"
      @click="returnToPreferences"
    />
  </div>
</template>

<style lang="sass" scoped>
.world-inspector__color
  width: 100%
</style>
