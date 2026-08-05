<script lang="ts" setup>
import { computed } from "vue";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import ProbeInspector from "./ProbeInspector.vue";
import CameraInspector from "./CameraInspector.vue";

const currentExperiment = useCurrentExperimentStore();

/** Selected probe, or null when the selection is something else. */
const selectedProbe = computed(() =>
  currentExperiment.selectedInspectable?.inspectableKind === "probe"
    ? currentExperiment.selectedInspectable
    : null
);

/** Is the scene camera the current selection. */
const isCameraSelected = computed(
  () => currentExperiment.selectedInspectable?.inspectableKind === "camera"
);
</script>

<template>
  <div class="q-pa-md full-height column">
    <ProbeInspector v-if="selectedProbe" :probe="selectedProbe" />
    <CameraInspector v-else-if="isCameraSelected" />
    <div v-else class="col flex flex-center">
      <p class="text-weight-light">
        <i>{{ $t("inspector.emptyHint") }}</i>
      </p>
    </div>
  </div>
</template>
