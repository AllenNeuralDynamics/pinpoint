<script lang="ts" setup>
import { toRaw } from "vue";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";

const preferences = usePreferencesStore();
const currentExperimentStore = useCurrentExperimentStore();

/**
 * Retain the scene's coordinate systems as the defaults for new scenes, taking
 * a copy of the current ones the moment retention is turned on.
 * @param isRetained Whether edits to this scene's systems become the defaults.
 */
function setRetained(isRetained: boolean): void {
  preferences.areCoordinateSystemsRetained = isRetained;
  if (!isRetained) return;

  preferences.newSceneGlobalCoordinateSystem = structuredClone(
    toRaw(currentExperimentStore.globalCoordinateSystem)
  );
  preferences.newSceneLocalCoordinateSystem = structuredClone(
    toRaw(currentExperimentStore.localCoordinateSystem)
  );
}
</script>

<template>
  <div>
    <q-toggle
      :label="$t('preferences.retainCoordinateSystems')"
      :model-value="preferences.areCoordinateSystemsRetained"
      @update:model-value="setRetained"
    />
    <div class="text-caption">
      {{ $t("preferences.retainCoordinateSystemsHint") }}
    </div>
  </div>
</template>
