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
import { getProbeFrame } from "../api/probe-frame.api";
import {
  formatSliceExtentMillimeters,
  getContourPolygonPoints,
  getProbeSlicePlane,
  getQuantizedSizePixels,
  getSlicePixelFromRect
} from "../api/slice-plane.api";
import { useAnnotationSampler } from "../composable/useAnnotationSampler";
import { useDelayedFlag } from "../composable/useDelayedFlag";
import { useMotionResolutionScale } from "../composable/useMotionResolutionScale";
import { useSliceCanvasPainter } from "../composable/useSliceCanvasPainter";
import { useSliceViewport } from "../composable/useSliceViewport";

/** How long sampling must run before the loading bar is worth showing. */
const LOADING_BAR_DELAY_MILLISECONDS = 500;

const { probe } = defineProps<{ probe: Probe }>();

const currentExperiment = useCurrentExperimentStore();
const { t } = useI18n();

const square = useTemplateRef<HTMLDivElement>("square");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const { width, height: squareHeight } = useElementSize(square, undefined, {
  box: "border-box"
});
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
    computed(() => currentExperiment.atlas)
  );

/** Full-resolution device-pixel edge length, quantized to bound replans. */
const settledSizePixels = computed(() =>
  getQuantizedSizePixels(width.value, pixelRatio.value)
);

/**
 * Everything that would trigger a replan, excluding the resolution scale
 * itself - feeding the scale back in would make its own change look like
 * movement.
 */
const motionKey = computed(() =>
  [
    settledSizePixels.value,
    ...probe.tipPosition,
    ...probe.rotation,
    ...currentExperiment.referenceCoordinate,
    centerHeightMillimeters.value,
    extentMillimeters.value
  ].join(",")
);

const resolutionScale = useMotionResolutionScale(motionKey);

/** Device-pixel edge length of the square canvas, reduced while moving. */
const sizePixels = computed(() =>
  getQuantizedSizePixels(width.value, pixelRatio.value * resolutionScale.value)
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

const { createStream, structureIndex } = useAnnotationSampler();
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

const hoveredStructure = computed<TerminologyRow | null>(
  () => structureIndex.value.get(hoveredAnnotationValue.value) ?? null
);

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

  const pixel = getSlicePixelFromRect(
    element.getBoundingClientRect(),
    event.clientX,
    event.clientY,
    slice.widthPixels,
    slice.heightPixels
  );
  hoveredAnnotationValue.value = pixel
    ? (slice.annotationValues[pixel.y * slice.widthPixels + pixel.x] ?? 0)
    : 0;
}

/** Clear the hovered structure when the pointer leaves the canvas. */
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
      :label-value="
        t('slice.millimeters', { value: centerHeightMillimeters.toFixed(2) })
      "
      label
      :step="0"
      dense
      class="col-auto slice-canvas__center-slider"
      :style="{ height: `${squareHeight}px` }"
      :aria-label="t('slice.center')"
    />

    <div class="col column">
      <div
        ref="square"
        class="slice-canvas__square relative-position"
        :style="{ height: `${width}px` }"
      >
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

        <q-tooltip v-if="hoveredStructure" model-value no-parent-event>
          {{ hoveredStructure.abbreviation }} - {{ hoveredStructure.name }}
        </q-tooltip>
      </div>

      <q-slider
        v-model="zoomExponent"
        :min="zoomRange.minimum"
        :max="zoomRange.maximum"
        :label-value="
          t('slice.millimeters', {
            value: formatSliceExtentMillimeters(extentMillimeters)
          })
        "
        label
        :step="0"
        :markers="1"
        :marker-labels="zoomMarkerLabel"
        dense
        class="q-mt-md"
        :aria-label="t('slice.zoom')"
      />
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
