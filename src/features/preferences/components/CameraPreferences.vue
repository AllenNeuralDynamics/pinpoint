<script lang="ts" setup>
import { usePreferencesStore } from "@/stores/preferences.store";

const preferences = usePreferencesStore();
</script>

<template>
  <div>
    <div class="text-h6">{{ $t("preferences.camera") }}</div>
    <div class="column q-gutter-y-md">
      <q-btn-toggle
        v-model="preferences.cameraProjection"
        :aria-label="$t('preferences.projection')"
        :options="[
          { label: $t('preferences.perspective'), value: 'perspective' },
          { label: $t('preferences.orthographic'), value: 'orthographic' }
        ]"
        spread
        toggle-color="primary"
      />
      <div>
        <div class="text-body2 q-pb-xs">{{ $t("preferences.inertia") }}</div>
        <q-slider
          v-model="preferences.cameraInertia"
          :aria-label="$t('preferences.inertia')"
          :min="0"
          :max="1"
          :step="0.05"
          :markers="1"
          :marker-labels="{
            0: $t('preferences.inertiaSnappy'),
            1: $t('preferences.inertiaSmooth')
          }"
          class="q-px-lg"
          label
        />
      </div>
    </div>
  </div>
</template>
