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
    <UnitPreferences />
  </div>
</template>
