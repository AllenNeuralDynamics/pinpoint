<script lang="ts" setup>
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  useTemplateRef,
  watch,
  watchEffect
} from "vue";
import { useBabylonRuntimeService } from "@/composable/useBabylonRuntimeService";
import {
  removeAllStructures,
  setAtlasRootReference,
  syncStructureVisibility
} from "../api/entity-loader.api";
import { setInitialZoom } from "../api/camera.api";
import { StructureEntity } from "../models/structure-entity.model";
import { structureEntityFromIdentifier } from "@/features/atlas";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useQuasar } from "quasar";
import { useI18n } from "vue-i18n";

const $q = useQuasar();
const { t } = useI18n();
const currentExperiment = useCurrentExperimentStore();
const runtime = useBabylonRuntimeService();

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");

/**
 * Whether structures are currently being synced into the scene, driving the
 * loading bar overlaid on the canvas.
 */
const isLoadingStructures = ref(false);

/**
 * Atlas structures that must always be present in the scene, faded out when
 * not visible instead of being removed.
 */
const alwaysPresentStructures = computed<StructureEntity[]>(() => {
  const { manifest, terminologyRows, areAtlasComponentsEvaluating } =
    currentExperiment;
  if (!manifest || !terminologyRows || areAtlasComponentsEvaluating) return [];

  return currentExperiment.defaultStructureIdentifiers.flatMap(identifier => {
    const structureEntity = structureEntityFromIdentifier(
      manifest,
      terminologyRows,
      identifier
    );
    return structureEntity ? [structureEntity] : [];
  });
});

/**
 * Structures the current experiment has marked visible.
 */
const visibleStructures = computed<StructureEntity[]>(() => {
  const { manifest, terminologyRows, areAtlasComponentsEvaluating } =
    currentExperiment;
  if (!manifest || !terminologyRows || areAtlasComponentsEvaluating) return [];

  return currentExperiment.visibleStructures.flatMap(identifier => {
    const structureEntity = structureEntityFromIdentifier(
      manifest,
      terminologyRows,
      identifier
    );
    return structureEntity ? [structureEntity] : [];
  });
});

/**
 * Trigger engine resizing on page area resize.
 */
function onResize() {
  runtime.engine.value?.resize();
}

onMounted(async () => {
  // Exit if no canvas.
  if (!canvas.value) {
    throw new Error("Scene canvas not found in DOM!");
  }

  // Initialize Babylon runtime.
  await runtime.init(canvas.value);

  // Keep the scene in sync with the current atlas's default structures and the
  // experiment's visible structure selection.
  watchEffect(async () => {
    const scene = runtime.scene.value;
    if (!scene) return;

    isLoadingStructures.value = true;
    try {
      await syncStructureVisibility(
        scene,
        alwaysPresentStructures.value,
        visibleStructures.value
      );
    } catch {
      $q.notify({
        message: t("sceneCanvas.problemLoadingAtlasMeshes"),
        caption: t("sceneCanvas.atlasLikelyNotSupportedYet"),
        color: "negative",
        icon: "error"
      });
    } finally {
      isLoadingStructures.value = false;
    }
  });

  // Keep the atlas root positioned so the experiment's reference coordinate
  // sits at the scene origin.
  watchEffect(() => {
    const scene = runtime.scene.value;
    if (!scene) return;

    setAtlasRootReference(scene, currentExperiment.referenceCoordinate);
  });

  // Set the camera's initial zoom relative to the AP length of the atlas.
  watchEffect(() => {
    const camera = runtime.camera.value;
    const { manifest, areAtlasComponentsEvaluating } = currentExperiment;
    if (!camera || !manifest || areAtlasComponentsEvaluating) return;

    setInitialZoom(manifest, camera);
  });

  // Clear the scene whenever the atlas changes.
  watch(
    [() => runtime.scene.value, () => currentExperiment.atlas],
    ([newScene]) => {
      if (!newScene) return;

      removeAllStructures(newScene);
    }
  );
});

onUnmounted(() => {
  runtime.dispose();
});
</script>

<template>
  <div class="fit relative-position">
    <canvas ref="canvas" class="fit" />
    <q-linear-progress
      v-if="isLoadingStructures"
      indeterminate
      color="secondary"
      size="lg"
      class="absolute-bottom"
    />
  </div>
  <q-resize-observer @resize="onResize" />
</template>

<style scoped>
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
