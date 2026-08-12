<script lang="ts" setup>
import { useAtlasAxes } from "@/composable/useAtlasAxes";
import { usePreferencesStore } from "@/stores/preferences.store";
import AxisNameList from "./AxisNameList.vue";

const preferences = usePreferencesStore();
const { positionDefaultNames, rotationDefaultNames } = useAtlasAxes();
</script>

<template>
  <div>
    <div class="text-h6">{{ $t("preferences.axesTitle") }}</div>
    <div class="column q-gutter-y-md">
      <AxisNameList
        :default-names="positionDefaultNames"
        :label="$t('preferences.positionAxes')"
        :names="preferences.positionAxisNames"
        :order="preferences.positionAxisOrder"
      />
      <AxisNameList
        :default-names="rotationDefaultNames"
        :label="$t('preferences.rotationAxes')"
        :names="preferences.rotationAxisNames"
        :order="preferences.rotationAxisOrder"
      />
    </div>
  </div>
</template>
