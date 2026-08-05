<script lang="ts" setup>
import {
  computed,
  onUnmounted,
  shallowRef,
  toRef,
  useTemplateRef,
  watch
} from "vue";
import { useDevicePixelRatio, useElementSize } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import type { Probe, ProbeShank } from "@/features/probe";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  getChannelMapLabels,
  getStructureLabelRuns
} from "../api/channel-map-label.api";
import { getProbeFrame } from "../api/probe-frame.api";
import { isSampleResultComplete } from "../api/sample-result.api";
import {
  getContactOutlinePath,
  getProbeChannelMapWindow,
  getShankLayout,
  getShankOutlinePath,
  getShankSliceGeometry,
  getSlicePixelFromRect
} from "../api/slice-plane.api";
import { useAnnotationSampler } from "../composable/useAnnotationSampler";
import { useDelayedFlag } from "../composable/useDelayedFlag";
import { useSliceCanvasPainter } from "../composable/useSliceCanvasPainter";
import type { ChannelMapHover } from "../models/channel-map-hover.model";
import type { ChannelMapsZoom } from "../models/channel-maps-zoom.model";
import type { SampleResult } from "../models/sample-result.model";

/** CSS pixel line box each gutter label occupies. */
const LABEL_LINE_HEIGHT_PIXELS = 12;

/** How long sampling must run before the loading bar is worth showing. */
const LOADING_BAR_DELAY_MILLISECONDS = 500;

const {
  probe,
  shanks,
  heightMillimeters,
  imageFraction,
  zoomSelection,
  alignmentOffsetMillimeters
} = defineProps<{
  probe: Probe;
  shanks: ProbeShank[];
  /** Height of the probe's contour, spanned by every shank. */
  heightMillimeters: number;
  /** Fraction of the width the sampled shank image occupies, from `ChannelMaps`' shared widths. */
  imageFraction: number;
  /** Zoom level controlling whether the contour and contacts overlay render. */
  zoomSelection: ChannelMapsZoom;
  /** Probe-local x the probe's geometry is shifted by for its shank alignment, in mm. */
  alignmentOffsetMillimeters: number;
}>();

const emit = defineEmits<{
  /** Structure under the pointer, or null when the pointer leaves it. */
  hover: [hover: ChannelMapHover | null];
}>();

const currentExperiment = useCurrentExperimentStore();
const { t } = useI18n();

const root = useTemplateRef<HTMLDivElement>("root");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const { height } = useElementSize(canvas);
const { pixelRatio } = useDevicePixelRatio();

/**
 * Last complete sample result. Labels are derived only from complete
 * results: the sampler republishes once per worker flush, and runs measured
 * from a half-painted image would jump around mid-stream.
 */
const completeResult = shallowRef<SampleResult | null>(null);

/** Window along the shanks this canvas renders, resolved from the probe. */
const channelMapWindow = computed(() =>
  getProbeChannelMapWindow(probe, heightMillimeters)
);

/** Packed layout of every shank into one canvas, or null while unmeasured. */
const layout = computed(() =>
  getShankLayout(shanks, heightMillimeters, height.value, pixelRatio.value)
);

/** Sampling surface covering every shank's band, or null while unmeasured. */
const plane = computed(() => {
  if (!layout.value) return null;
  const frame = getProbeFrame(probe, currentExperiment.referenceCoordinate);
  return getShankSliceGeometry(
    frame,
    layout.value,
    channelMapWindow.value,
    alignmentOffsetMillimeters
  );
});

const { createStream, structureIndex } = useAnnotationSampler();
const { result, isLoading } = createStream(plane);

const isLoadingBarVisible = useDelayedFlag(
  isLoading,
  LOADING_BAR_DELAY_MILLISECONDS
);

/** Height the sampled window is centered on, matching `getShankSliceGeometry`. */
const centerHeightMillimeters = computed(
  () => (channelMapWindow.value.min + channelMapWindow.value.max) / 2
);

/** Vertical extent the window spans, in mm. */
const spanMillimeters = computed(
  () => channelMapWindow.value.max - channelMapWindow.value.min
);

/** viewBox spanning the packed shanks, centered like the sampled bands. */
const viewBox = computed(() =>
  layout.value
    ? `0 ${-spanMillimeters.value / 2} ${layout.value.widthMillimeters} ${spanMillimeters.value}`
    : null
);

/** Per-shank overlay geometry, in packed mm: a translate plus both paths. */
const overlays = computed(() =>
  (layout.value?.placements ?? []).map(placement => ({
    key: String(placement.shank.id),
    transform: `translate(${placement.offsetMillimeters} 0)`,
    outlinePath: getShankOutlinePath(
      placement.shank,
      centerHeightMillimeters.value
    ),
    contactsPath: getContactOutlinePath(
      placement.shank.contacts,
      centerHeightMillimeters.value
    )
  }))
);

/** Contour renders at medium and large zoom; contacts only at large zoom. */
const showContour = computed(() => zoomSelection !== "small");
const showContacts = computed(() => zoomSelection === "large");

/** Accessible label naming the probe. */
const ariaLabel = computed(() => t("slice.channelMap", { name: probe.name }));

/** Fraction of the width the sampled shank image occupies, left of the blank label gutter. */
const imageWidthPercent = computed(() => `${imageFraction * 100}%`);

/** One gutter line per structure run, with crowded runs reduced to the largest. */
const labels = computed(() =>
  getChannelMapLabels(
    completeResult.value ? getStructureLabelRuns(completeResult.value) : [],
    structureIndex.value,
    height.value,
    LABEL_LINE_HEIGHT_PIXELS
  ).map(({ key, abbreviation, topPixels }) => ({
    key,
    abbreviation,
    style: {
      lineHeight: `${LABEL_LINE_HEIGHT_PIXELS}px`,
      top: `${topPixels}px`
    }
  }))
);

/**
 * Emit the structure under the pointer, anchored to the map's right edge.
 * @param event Pointer move event.
 */
function onPointerMove(event: PointerEvent): void {
  const element = canvas.value;
  const container = root.value;
  const slice = result.value;
  if (!element || !container || !slice) {
    emit("hover", null);
    return;
  }

  const pixel = getSlicePixelFromRect(
    element.getBoundingClientRect(),
    event.clientX,
    event.clientY,
    slice.widthPixels,
    slice.heightPixels
  );
  const annotationValue = pixel
    ? (slice.annotationValues[pixel.y * slice.widthPixels + pixel.x] ?? 0)
    : 0;
  const structure = structureIndex.value.get(annotationValue);
  emit(
    "hover",
    structure
      ? {
          structure,
          clientX: container.getBoundingClientRect().right,
          clientY: event.clientY
        }
      : null
  );
}

/** Clear the parent's hover when the pointer leaves the canvas. */
function onPointerLeave(): void {
  emit("hover", null);
}

watch(result, value => {
  if (value && isSampleResultComplete(value)) completeResult.value = value;
});

watch(
  () => probe.id,
  () => (completeResult.value = null)
);

useSliceCanvasPainter(
  canvas,
  result,
  toRef(() => probe.id)
);

onUnmounted(() => emit("hover", null));
</script>

<template>
  <div ref="root" class="fit relative-position channel-map-canvas">
    <div
      class="channel-map-canvas__image"
      :style="{ width: imageWidthPercent }"
    >
      <canvas
        ref="canvas"
        class="fit channel-map-canvas__canvas"
        role="img"
        :aria-label="ariaLabel"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
      />
      <svg
        v-if="viewBox && showContour"
        class="fit absolute-top channel-map-canvas__overlay"
        :viewBox="viewBox"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g
          v-for="overlay of overlays"
          :key="overlay.key"
          :transform="overlay.transform"
        >
          <path :d="overlay.outlinePath" class="channel-map-canvas__contour" />
          <path
            v-if="showContacts && overlay.contactsPath"
            :d="overlay.contactsPath"
            class="channel-map-canvas__contacts"
          />
        </g>
      </svg>

      <q-linear-progress
        v-if="isLoadingBarVisible"
        indeterminate
        color="primary"
        size="sm"
        class="absolute-top"
      />
    </div>
    <div
      v-if="showContour"
      class="channel-map-canvas__labels"
      :style="{ left: imageWidthPercent }"
      aria-hidden="true"
    >
      <div
        v-for="label of labels"
        :key="label.key"
        class="channel-map-canvas__label"
        :style="label.style"
        >{{ label.abbreviation }}</div
      >
    </div>
  </div>
</template>

<style lang="sass" scoped>
.channel-map-canvas
  &__image,
  &__labels
    position: absolute
    top: 0
    bottom: 0

  &__image
    left: 0

  &__canvas
    display: block

  &__overlay
    pointer-events: none

  &__contour
    fill: none
    stroke: $dark
    stroke-opacity: 0.6
    stroke-width: 1
    vector-effect: non-scaling-stroke

  &__contacts
    fill: none
    stroke: $dark
    stroke-opacity: 0.6
    stroke-width: 1
    vector-effect: non-scaling-stroke

  &__labels
    right: 0
    pointer-events: none

  &__label
    position: absolute
    left: 0
    right: 0
    padding-left: 2px
    font-size: 10px
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

body.body--dark
  .channel-map-canvas__contour
    stroke: #fff

  .channel-map-canvas__contacts
    stroke: #fff
</style>
