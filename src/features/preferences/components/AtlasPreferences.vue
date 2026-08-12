<script lang="ts" setup>
import { usePreferencesStore } from "@/stores/preferences.store";

const preferences = usePreferencesStore();
</script>

<template>
  <div>
    <div class="text-h6">{{ $t("preferences.atlas") }}</div>
    <div class="column q-gutter-y-md">
      <div>
        <div class="text-body2 q-pb-xs">{{
          $t("preferences.structureFadedAlpha")
        }}</div>
        <q-slider
          v-model="preferences.structureFadedAlpha"
          :aria-label="$t('preferences.structureFadedAlpha')"
          :min="0.01"
          :max="1"
          :step="0.01"
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
