<script lang="ts" setup>
import CoordinateAxisInputs from "@/components/CoordinateAxisInputs.vue";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";

const currentExperimentStore = useCurrentExperimentStore();
</script>

<template>
  <div>
    <div class="text-h6">
      {{ $t("preferences.referenceCoordinateTitle") }}
    </div>
    <div class="text-caption q-pb-sm">
      {{ $t("preferences.referenceCoordinateHint") }}
    </div>
    <CoordinateAxisInputs
      kind="position"
      :tuple="currentExperimentStore.referenceCoordinate"
    />
  </div>
</template>
