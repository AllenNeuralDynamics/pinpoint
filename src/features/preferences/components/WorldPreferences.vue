<script lang="ts" setup>
import { usePreferencesStore } from "@/stores/preferences.store";
import { STANDARD_COLORS } from "@/features/scene";

/** Standard palette plus Babylon's default clear color, so it stays pickable after switching away from it. */
const BACKGROUND_COLOR_PALETTE = [...STANDARD_COLORS, "#33334d"];

const preferences = usePreferencesStore();
</script>

<template>
  <div class="row no-wrap q-col-gutter-md">
    <div class="col-auto">
      <div class="text-body2 q-pb-xs">{{
        $t("preferences.backgroundColor")
      }}</div>
      <q-color
        v-model="preferences.worldBackgroundColor"
        class="world-preferences__color"
        :palette="BACKGROUND_COLOR_PALETTE"
        default-view="palette"
      />
    </div>
    <div class="col column q-gutter-y-md justify-center">
      <div>
        <div class="text-body2 q-pb-xs">{{ $t("preferences.lightPower") }}</div>
        <q-slider
          v-model="preferences.worldLightIntensity"
          :aria-label="$t('preferences.lightPower')"
          :min="0"
          :max="2"
          :step="0.05"
          label
        />
      </div>
      <div>
        <div class="text-body2 q-pb-xs">{{
          $t("preferences.specularIntensity")
        }}</div>
        <q-slider
          v-model="preferences.materialSpecularIntensity"
          :aria-label="$t('preferences.specularIntensity')"
          :min="0"
          :max="1"
          :step="0.05"
          label
        />
      </div>
      <div>
        <div class="text-body2 q-pb-xs">{{
          $t("preferences.specularPower")
        }}</div>
        <q-slider
          v-model="preferences.materialSpecularPower"
          :aria-label="$t('preferences.specularPower')"
          :min="1"
          :max="128"
          :step="1"
          label
        />
      </div>
      <q-toggle
        v-model="preferences.areStructureInteriorsHidden"
        :label="$t('preferences.hideStructureInteriors')"
      />
    </div>
  </div>
</template>

<style lang="sass" scoped>
.world-preferences__color
  width: 300px
</style>
