<script lang="ts" setup>
import CameraPreferences from "./CameraPreferences.vue";
import { WORLD_INSPECTABLE } from "@/features/scene";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";

const emit = defineEmits<{ inspectWorld: [] }>();

const currentExperiment = useCurrentExperimentStore();

/** Select the world in the inspector and ask the host dialog to close. */
function inspectWorld(): void {
  currentExperiment.selectedInspectable = WORLD_INSPECTABLE;
  emit("inspectWorld");
}
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
        :label="$t('preferences.editInInspector')"
        @click="inspectWorld"
      />
    </div>
  </div>
</template>
