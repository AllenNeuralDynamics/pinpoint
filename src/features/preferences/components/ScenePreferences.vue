<script lang="ts" setup>
import CameraPreferences from "./CameraPreferences.vue";
import UnitPreferences from "./UnitPreferences.vue";

const emit = defineEmits<{ openWorldEditor: [] }>();
</script>

<template>
  <div class="column q-gutter-y-md">
    <CameraPreferences />
    <q-separator />
    <div>
      <div class="text-h6">{{ $t("preferences.world") }}</div>
      <q-btn
        class="q-mt-sm"
        color="primary"
        :label="$t('preferences.openEditor')"
        @click="emit('openWorldEditor')"
      />
    </div>
    <q-separator />
    <UnitPreferences />
  </div>
</template>
