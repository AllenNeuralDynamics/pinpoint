<script lang="ts" setup>
import GlobalCoordinatePreferences from "./GlobalCoordinatePreferences.vue";
import LocalCoordinatePreferences from "./LocalCoordinatePreferences.vue";
import ReferenceCoordinatePreferences from "./ReferenceCoordinatePreferences.vue";
import RetainCoordinateSystems from "./RetainCoordinateSystems.vue";
</script>

<template>
  <div class="column q-gutter-y-md">
    <GlobalCoordinatePreferences />
    <q-separator />
    <LocalCoordinatePreferences />
    <q-separator />
    <ReferenceCoordinatePreferences />
    <q-separator />
    <RetainCoordinateSystems />
  </div>
</template>
