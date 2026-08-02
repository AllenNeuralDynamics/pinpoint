<script lang="ts" setup>
import { computed, ref, toRef, useTemplateRef } from "vue";
import { useDevicePixelRatio, useElementSize } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import type { TerminologyRow } from "@/features/atlas";
import type { Probe } from "@/features/probe";
import { getProbeContour } from "@/features/probe";
import {
  isStructureVisible,
  setStructureVisibility
} from "@/features/experiment";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useDelayedFlag } from "@/composable/useDelayedFlag";
import { getProbeFrame } from "../api/probe-frame.api";
import { getSampleEdgeLength } from "../api/sample-result.api";
import {
  formatSliceExtentMillimeters,
  getContourPolygonPoints,
  getProbeSlicePlane,
  getQuantizedSizePixels,
  getSlicePixelFromRect
} from "../api/slice-plane.api";
import { findStructureByAnnotationValue } from "../api/structure-colors.api";
import { useAnnotationSampler } from "../composable/useAnnotationSampler";
import { useSliceCanvasPainter } from "../composable/useSliceCanvasPainter";
import { useSliceViewport } from "../composable/useSliceViewport";

/** How long sampling must run before the loading bar is worth showing. */
const LOADING_BAR_DELAY_MILLISECONDS = 500;

const { probe } = defineProps<{ probe: Probe }>();

const currentExperiment = useCurrentExperimentStore();
const { t } = useI18n();

const square = useTemplateRef<HTMLDivElement>("square");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const { width, height: squareHeight } = useElementSize(square);
const { pixelRatio } = useDevicePixelRatio();

/** Annotation value currently under the pointer, or 0 for background/none. */
const hoveredAnnotationValue = ref(0);

const probeInterfaceProbe = computed(
  () =>
    currentExperiment.probeInterfaceProbes[probe.probeInterfaceIdentifier] ??
    null
);

const contour = computed(() =>
  probeInterfaceProbe.value ? getProbeContour(probeInterfaceProbe.value) : null
);

const { zoomRange, extentMillimeters, zoomExponent, centerHeightMillimeters } =
  useSliceViewport(
    toRef(() => probe),
    contour,
    computed(() => currentExperiment.manifest)
  );

/** Device-pixel edge length of the square canvas, quantized to bound replans. */
const sizePixels = computed(() =>
  getQuantizedSizePixels(width.value, pixelRatio.value)
);

const plane = computed(() => {
  if (!contour.value || sizePixels.value === 0) return null;
  const frame = getProbeFrame(probe, currentExperiment.referenceCoordinate);
  return getProbeSlicePlane(
    frame,
    centerHeightMillimeters.value,
    extentMillimeters.value,
    sizePixels.value
  );
});

const { createStream } = useAnnotationSampler({
  manifest: computed(() => currentExperiment.manifest),
  terminologyRows: computed(() => currentExperiment.terminologyRows)
});
const { result, isLoading } = createStream(plane);

/**
 * Whether to show the loading bar. Sampling is usually fast enough that
 * binding the bar straight to `isLoading` strobes it - a slider drag
 * replans every frame - so it only appears once loading has run past
 * `LOADING_BAR_DELAY_MILLISECONDS`, and hides the moment loading ends.
 */
const isLoadingBarVisible = useDelayedFlag(
  isLoading,
  LOADING_BAR_DELAY_MILLISECONDS
);

/** SVG polygon points for the contour overlay, in probe-local mm re-origined on the slice center. */
const contourPoints = computed(() =>
  contour.value
    ? getContourPolygonPoints(contour.value, centerHeightMillimeters.value)
    : null
);

const hoveredStructure = computed<TerminologyRow | null>(() => {
  if (!hoveredAnnotationValue.value) return null;
  return findStructureByAnnotationValue(
    currentExperiment.terminologyRows,
    hoveredAnnotationValue.value
  );
});

/**
 * Marker label for a zoom slider tick, converting its log2 exponent back to mm.
 * @param exponent Tick position, as a log2 mm exponent.
 */
function zoomMarkerLabel(exponent: number): string {
  return formatSliceExtentMillimeters(2 ** exponent);
}

/**
 * Update the hovered structure from a pointer move over the canvas.
 * @param event Pointer move event.
 */
function onPointerMove(event: PointerEvent): void {
  const element = canvas.value;
  const slice = result.value;
  if (!element || !slice) {
    hoveredAnnotationValue.value = 0;
    return;
  }

  const size = getSampleEdgeLength(slice);
  const pixel = getSlicePixelFromRect(
    element.getBoundingClientRect(),
    event.clientX,
    event.clientY,
    size
  );
  hoveredAnnotationValue.value = pixel
    ? (slice.annotationValues[pixel.y * size + pixel.x] ?? 0)
    : 0;
}

function onPointerLeave(): void {
  hoveredAnnotationValue.value = 0;
}

/**
 * Toggle the hovered structure's visibility in the 3D scene.
 */
function onClick(): void {
  const structure = hoveredStructure.value;
  if (!structure) return;

  setStructureVisibility(
    currentExperiment.experiment,
    structure.identifier,
    !isStructureVisible(currentExperiment.experiment, structure.identifier)
  );
}

useSliceCanvasPainter(
  canvas,
  result,
  toRef(() => probe.id)
);
</script>

<template>
  <div class="row no-wrap items-start slice-canvas">
    <q-slider
      v-if="contour"
      v-model="centerHeightMillimeters"
      vertical
      reverse
      :min="0"
      :max="contour.heightMillimeters"
      :step="0"
      dense
      class="col-auto slice-canvas__center-slider"
      :style="{ height: `${squareHeight}px` }"
      :aria-label="t('slice.center')"
    />

    <div class="col column">
      <div ref="square" class="slice-canvas__square relative-position">
        <canvas
          ref="canvas"
          class="fit slice-canvas__canvas"
          @pointermove="onPointerMove"
          @pointerleave="onPointerLeave"
          @click="onClick"
        />
        <svg
          v-if="contour"
          class="fit absolute-top slice-canvas__overlay"
          :viewBox="`${-extentMillimeters / 2} ${-extentMillimeters / 2} ${extentMillimeters} ${extentMillimeters}`"
          preserveAspectRatio="none"
        >
          <polygon
            v-if="contourPoints"
            :points="contourPoints"
            class="slice-canvas__contour"
          />
        </svg>

        <q-linear-progress
          v-if="isLoadingBarVisible"
          indeterminate
          color="primary"
          size="sm"
          class="absolute-top"
        />

        <div v-if="!contour" class="fit flex flex-center absolute-top">
          <p class="text-caption text-weight-light">{{
            t("slice.noContour")
          }}</p>
        </div>

        <!--
          QTooltip normally shows itself from its own anchor's mouseenter,
          but that anchor only exists once this v-if mounts - entering over
          background then moving onto a structure gets no further
          mouseenter to trigger it. Driving it from the model instead shows
          it the instant it mounts; no-parent-event stops QTooltip's own
          mouseleave handling from then fighting that model.
        -->
        <q-tooltip v-if="hoveredStructure" model-value no-parent-event>
          {{ hoveredStructure.abbreviation }} - {{ hoveredStructure.name }}
        </q-tooltip>
      </div>

      <q-slider
        v-model="zoomExponent"
        :min="zoomRange.minimum"
        :max="zoomRange.maximum"
        :step="0"
        :markers="1"
        :marker-labels="zoomMarkerLabel"
        dense
        class="q-mt-md"
        :aria-label="t('slice.zoom')"
      />
      <div class="row justify-center q-mt-xs">
        <span class="text-caption">{{
          t("slice.extent", {
            extent: formatSliceExtentMillimeters(extentMillimeters)
          })
        }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="sass" scoped>
.slice-canvas
  width: 100%

  &__center-slider
    margin-right: 8px

  &__square
    position: relative
    aspect-ratio: 1
    border: 1px solid $separator-color
    border-radius: $generic-border-radius
    overflow: hidden

  &__canvas
    display: block

  &__overlay
    pointer-events: none

  &__contour
    fill: none
    stroke: $dark
    stroke-width: 0.02
    opacity: 0.6

body.body--dark
  .slice-canvas__square
    border-color: $separator-dark-color

  .slice-canvas__contour
    stroke: #fff
</style>
