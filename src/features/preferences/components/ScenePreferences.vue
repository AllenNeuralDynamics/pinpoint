<script lang="ts" setup>
import CameraPreferences from "./CameraPreferences.vue";
import WorldPreferences from "./WorldPreferences.vue";
import UnitPreferences from "./UnitPreferences.vue";
</script>

<template>
  <div class="column q-gutter-y-md">
    <CameraPreferences />
    <q-separator />
    <WorldPreferences />
    <q-separator />
    <UnitPreferences />
  </div>
</template>
