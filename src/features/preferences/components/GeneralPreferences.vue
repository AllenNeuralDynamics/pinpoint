<script lang="ts" setup>
import { usePreferencesStore } from "@/stores/preferences.store";
import UnitPreferences from "./UnitPreferences.vue";

const preferences = usePreferencesStore();
</script>

<template>
  <div class="column q-gutter-y-md">
    <div>
      <div class="text-h6">{{ $t("preferences.appearanceTitle") }}</div>
      <div>
        <div class="text-body2 q-pb-xs">{{ $t("preferences.theme") }}</div>
        <q-btn-toggle
          v-model="preferences.appearance"
          :aria-label="$t('preferences.theme')"
          no-caps
          :options="[
            { label: $t('preferences.themeLight'), value: 'light' },
            { label: $t('preferences.themeDark'), value: 'dark' },
            { label: $t('preferences.themeAuto'), value: 'auto' }
          ]"
          spread
          toggle-color="primary"
        />
      </div>
    </div>
    <q-separator />
    <div>
      <div class="text-h6">{{ $t("preferences.startupTitle") }}</div>
      <q-toggle
        v-model="preferences.isSplashScreenSkipped"
        :label="$t('preferences.skipSplashScreen')"
      />
    </div>
    <q-separator />
    <div>
      <div class="text-h6">{{ $t("preferences.interactionTitle") }}</div>
      <div>
        <div class="text-body2 q-pb-xs">
          {{ $t("preferences.dragSensitivity") }}
        </div>
        <q-slider
          v-model="preferences.dragSensitivity"
          :aria-label="$t('preferences.dragSensitivity')"
          :min="0.25"
          :max="4"
          :step="0.25"
          :marker-labels="{
            0.25: $t('preferences.dragSensitivityValue', { value: 0.25 }),
            1: $t('preferences.dragSensitivityValue', { value: 1 }),
            4: $t('preferences.dragSensitivityValue', { value: 4 })
          }"
          class="q-px-lg"
          label
          :label-value="
            $t('preferences.dragSensitivityValue', {
              value: preferences.dragSensitivity
            })
          "
        />
      </div>
    </div>
    <q-separator />
    <UnitPreferences />
  </div>
</template>
