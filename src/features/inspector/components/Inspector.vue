<script lang="ts" setup>
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import ProbeInspector from "../components/ProbeInspector.vue";

const currentExperiment = useCurrentExperimentStore();
</script>

<template>
  <div class="q-pa-md full-height column">
    <ProbeInspector
      v-if="currentExperiment.selectedInspectable?.inspectableKind === 'probe'"
      :probe="currentExperiment.selectedInspectable"
    />
    <div v-else class="col flex flex-center text-center">
      <p class="text-weight-light">
        <i>{{ $t("inspector.emptyHint") }}</i>
      </p>
    </div>
  </div>
</template>

<style lang="sass" scoped></style>
