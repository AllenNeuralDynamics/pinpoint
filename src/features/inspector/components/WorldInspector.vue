<script lang="ts" setup>
import { useQuasar } from "quasar";
import { openPreferencesDialog } from "@/features/preferences";
import { STANDARD_COLORS } from "@/features/scene";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";

/** Standard palette plus Babylon's default clear color, so it stays pickable after switching away from it. */
const BACKGROUND_COLOR_PALETTE = [...STANDARD_COLORS, "#33334d"];

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
        $t("worldInspector.backgroundColor")
      }}</div>
      <q-color
        v-model="preferences.worldBackgroundColor"
        class="world-inspector__color"
        :palette="BACKGROUND_COLOR_PALETTE"
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
    <q-toggle
      v-model="preferences.areStructureInteriorsHidden"
      :label="$t('worldInspector.hideStructureInteriors')"
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
