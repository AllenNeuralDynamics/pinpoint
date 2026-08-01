<script lang="ts" setup>
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import {
  useDevicePixelRatio,
  useElementSize,
  useTimeoutFn
} from "@vueuse/core";
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
import { isSampleResultComplete } from "../api/sample-result.api";
import {
  clampSliceCenterHeight,
  clampSliceExtent,
  getDefaultSliceExtentMillimeters,
  getProbeSlicePlane,
  getSliceZoomExponentRange
} from "../api/slice-plane.api";
import { findStructureByAnnotationValue } from "../api/structure-colors.api";
import { useAnnotationSampler } from "../composable/useAnnotationSampler";

/** Device-pixel edge lengths the canvas is quantized to, to bound replan frequency. */
const MINIMUM_SIZE_PIXELS = 128;
const MAXIMUM_SIZE_PIXELS = 1024;
const SIZE_QUANTUM_PIXELS = 32;

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

const centerHeightMillimeters = computed({
  get: () =>
    contour.value
      ? clampSliceCenterHeight(
          probe.sliceCenterHeightMillimeters,
          contour.value
        )
      : probe.sliceCenterHeightMillimeters,
  set: (value: number) => {
    probe.sliceCenterHeightMillimeters = value;
  }
});

/** Zoom range, as log2 mm exponents, scaled to the current atlas's size. */
const zoomRange = computed(() =>
  getSliceZoomExponentRange(currentExperiment.manifest)
);

/**
 * Effective slice extent, in mm - a probe whose zoom has never been set
 * (`sliceExtentMillimeters === null`) defaults to the middle of the current
 * atlas's range; a persisted extent can fall outside that range, e.g. after
 * switching atlases, so it's clamped instead.
 */
const extentMillimeters = computed(() =>
  probe.sliceExtentMillimeters === null
    ? getDefaultSliceExtentMillimeters(zoomRange.value)
    : clampSliceExtent(probe.sliceExtentMillimeters, zoomRange.value)
);

const zoomExponent = computed({
  get: () => Math.log2(extentMillimeters.value),
  set: (value: number) => {
    probe.sliceExtentMillimeters = 2 ** value;
  }
});

/** Device-pixel edge length of the square canvas, quantized to bound replans. */
const sizePixels = computed(() => {
  if (width.value === 0) return 0;
  const devicePixels = width.value * pixelRatio.value;
  const quantized =
    Math.floor(devicePixels / SIZE_QUANTUM_PIXELS) * SIZE_QUANTUM_PIXELS;
  return Math.min(
    MAXIMUM_SIZE_PIXELS,
    Math.max(MINIMUM_SIZE_PIXELS, quantized)
  );
});

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
const isLoadingBarVisible = ref(false);
const { start: startLoadingBarDelay, stop: stopLoadingBarDelay } = useTimeoutFn(
  () => (isLoadingBarVisible.value = true),
  LOADING_BAR_DELAY_MILLISECONDS,
  { immediate: false }
);

watch(
  isLoading,
  loading => {
    if (loading) {
      startLoadingBarDelay();
    } else {
      stopLoadingBarDelay();
      isLoadingBarVisible.value = false;
    }
  },
  { immediate: true }
);

/** SVG polygon points for the contour overlay, in probe-local mm re-origined on the slice center. */
const contourPoints = computed(() => {
  if (!contour.value) return null;
  const center = centerHeightMillimeters.value;
  return contour.value.points.map(({ x, y }) => `${x},${center - y}`).join(" ");
});

const hoveredStructure = computed<TerminologyRow | null>(() => {
  if (!hoveredAnnotationValue.value) return null;
  return findStructureByAnnotationValue(
    currentExperiment.terminologyRows,
    hoveredAnnotationValue.value
  );
});

/**
 * Human-readable slice extent, rounded to avoid runs of float noise.
 * @param extentMillimeters Extent to format, in mm.
 */
function formatSliceExtent(extentMillimeters: number): string {
  return Number(extentMillimeters.toPrecision(2)).toString();
}

/**
 * Marker label for a zoom slider tick, converting its log2 exponent back to mm.
 * @param exponent Tick position, as a log2 mm exponent.
 */
function zoomMarkerLabel(exponent: number): string {
  return formatSliceExtent(2 ** exponent);
}

/**
 * Convert a pointer event to a device-pixel coordinate on the slice canvas.
 * @param event Pointer event over the canvas.
 */
function pixelFromEvent(event: PointerEvent): { x: number; y: number } | null {
  const element = canvas.value;
  const slice = result.value;
  if (!element || !slice) return null;

  const size = Math.round(Math.sqrt(slice.sampleCount));
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const x = Math.floor(((event.clientX - rect.left) / rect.width) * size);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * size);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return { x, y };
}

/**
 * Update the hovered structure from a pointer move over the canvas.
 * @param event Pointer move event.
 */
function onPointerMove(event: PointerEvent): void {
  const pixel = pixelFromEvent(event);
  const slice = result.value;
  if (!pixel || !slice) {
    hoveredAnnotationValue.value = 0;
    return;
  }

  const size = Math.round(Math.sqrt(slice.sampleCount));
  hoveredAnnotationValue.value =
    slice.annotationValues[pixel.y * size + pixel.x] ?? 0;
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

/** Id of the probe the canvas currently holds a painted (or in-progress) image for. */
let paintedProbeId: string | null = null;

/**
 * Blank the canvas and forget which probe it was painted for, so a stale
 * image from a previous probe (or atlas) is never mistaken for the current
 * one's.
 */
function clearCanvas(): void {
  const element = canvas.value;
  paintedProbeId = null;
  if (!element) return;

  const context = element.getContext("2d");
  context?.clearRect(0, 0, element.width, element.height);
}

/**
 * Paint the current result onto the canvas, unless it's a partial update at
 * a resolution the canvas already holds a complete image for *and* for the
 * same probe - preserving that image avoids a flicker to empty between
 * geometry updates. A resize or a probe switch has no prior image to
 * protect, so partial results are blitted as they stream instead of leaving
 * the square blank or showing a previous probe's slice.
 */
function drawSlice(): void {
  const element = canvas.value;
  const slice = result.value;
  if (!element || !slice?.pixels) return;

  const size = Math.round(Math.sqrt(slice.sampleCount));
  const isCanvasCurrent = element.width === size && paintedProbeId === probe.id;
  if (isCanvasCurrent && !isSampleResultComplete(slice)) return;

  if (element.width !== size) {
    element.width = size;
    element.height = size;
  }

  const context = element.getContext("2d");
  if (!context) return;
  // `SampleResult.pixels` is declared as a plain `Uint8ClampedArray`, which
  // TS's newer typed-array generics widen to `ArrayBufferLike` (a superset
  // that also covers SharedArrayBuffer); `ImageData` only accepts the
  // narrower `ArrayBuffer`-backed variant, so this is a type-only mismatch.
  const pixels = slice.pixels as Uint8ClampedArray<ArrayBuffer>;
  context.putImageData(new ImageData(pixels, size, size), 0, 0);
  paintedProbeId = probe.id;
}

// `flush: "post"` and the `onMounted` call both exist for the same reason:
// a result can already be published (the sampler's shared worker pool and
// open volume persist across mounts) before this component's canvas ref is
// set, e.g. right after switching the selected probe - without repainting
// once mounted, that already-sampled result would never reach the screen.
watch(result, value => (value ? drawSlice() : clearCanvas()), {
  flush: "post"
});
onMounted(drawSlice);

// `SliceCanvas` is reused across probe switches (the `v-if` selecting it
// lives one level up, on `ProbeInspector`), so the previous probe's image
// must be explicitly invalidated - otherwise it would linger under the
// newly selected probe until a new result streams in.
watch(
  () => probe.id,
  () => {
    hoveredAnnotationValue.value = 0;
    clearCanvas();
  }
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
          color="secondary"
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
          t("slice.extent", { extent: formatSliceExtent(extentMillimeters) })
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
