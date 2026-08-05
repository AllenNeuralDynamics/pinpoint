<script lang="ts" setup>
import { usePreferencesStore } from "@/stores/preferences.store";
import { STANDARD_COLORS } from "@/features/scene";

const preferences = usePreferencesStore();
</script>

<template>
  <div>
    <div class="text-h6">{{ $t("preferences.world") }}</div>
    <div class="column q-gutter-y-md">
      <div class="q-mb-md">
        <div class="text-body2 q-pb-xs">{{
          $t("preferences.backgroundColor")
        }}</div>
        <q-color
          v-model="preferences.worldBackgroundColor"
          :palette="STANDARD_COLORS"
          default-view="palette"
        />
      </div>
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
    </div>
  </div>
</template>
