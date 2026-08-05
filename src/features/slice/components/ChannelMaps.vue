<script lang="ts" setup>
import { computed, ref, useTemplateRef } from "vue";
import { useElementBounding, useElementSize } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import type { ProbeShank } from "@/features/probe";
import {
  getProbeAlignmentOffsetMillimeters,
  getProbeContour,
  getProbeShanks
} from "@/features/probe";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  getChannelMapAspectRatio,
  getChannelMapTooltipPosition,
  getChannelMapWidths
} from "../api/channel-map-label.api";
import {
  getProbeChannelMapWindow,
  setProbeChannelMapWindow
} from "../api/slice-plane.api";
import type { ChannelMapHover } from "../models/channel-map-hover.model";
import type { ChannelMapsZoom } from "../models/channel-maps-zoom.model";
import ChannelMapCanvas from "./ChannelMapCanvas.vue";

interface ZoomStyles {
  /** Layout classes for the card header. */
  header: string;
  /** Typography class for the probe name. */
  name: string;
  /** CSS height of the slice canvas at this zoom. */
  canvasHeight: string;
}

/** One probe definition's packed shanks, derived once per interned definition. */
interface DefinitionShanks {
  shanks: ProbeShank[];
  heightMillimeters: number;
  /** Fraction of the full width the shank image occupies, left of the blank label gutter. */
  imageFraction: number;
}

const ZOOM_STYLES: Record<ChannelMapsZoom, ZoomStyles> = {
  small: {
    header: "column flex-center",
    name: "text-caption",
    canvasHeight: "15vh"
  },
  medium: {
    header: "row q-gutter-x-sm no-wrap items-center",
    name: "text-body2",
    canvasHeight: "30vh"
  },
  large: {
    header: "row q-gutter-x-sm no-wrap",
    name: "text-body1",
    canvasHeight: "70vh"
  }
};

/** Stand-in for a probe whose definition has no sliceable shanks. */
const NO_SHANKS: DefinitionShanks = {
  shanks: [],
  heightMillimeters: 0,
  imageFraction: 1
};

const currentExperiment = useCurrentExperimentStore();
const { t } = useI18n();

const root = useTemplateRef<HTMLDivElement>("root");
const tooltip = useTemplateRef<HTMLDivElement>("tooltip");
const {
  left: rootLeft,
  top: rootTop,
  width: rootWidth,
  height: rootHeight
} = useElementBounding(root);
const { width: tooltipWidth, height: tooltipHeight } = useElementSize(
  tooltip,
  undefined,
  { box: "border-box" }
);

const zoomSelection = ref<ChannelMapsZoom>("large");
const hover = ref<ChannelMapHover | null>(null);

const styles = computed(() => ZOOM_STYLES[zoomSelection.value]);

/** The label gutter renders at medium and large zoom, like the contour overlay. */
const showLabels = computed(() => zoomSelection.value !== "small");

/**
 * Shanks per interned definition. Keyed by identifier so a probe added,
 * removed, or renamed doesn't re-derive every definition's contact outlines.
 */
const shanksByIdentifier = computed(() => {
  const byIdentifier: Record<string, DefinitionShanks> = {};
  for (const [identifier, definition] of Object.entries(
    currentExperiment.probeInterfaceProbes
  )) {
    const contour = getProbeContour(definition);
    if (
      !contour ||
      contour.widthMillimeters <= 0 ||
      contour.heightMillimeters <= 0
    ) {
      continue;
    }
    const shanks = getProbeShanks(definition, contour);
    const widths = getChannelMapWidths(shanks);
    if (widths.shankMillimeters <= 0) continue;
    byIdentifier[identifier] = {
      shanks,
      heightMillimeters: contour.heightMillimeters,
      imageFraction: widths.imageFraction
    };
  }
  return byIdentifier;
});

/** Each probe paired with its packed shanks, aspect ratio and rendered window. */
const channelMaps = computed(() =>
  currentExperiment.probes.map(probe => {
    const { shanks, heightMillimeters, imageFraction } =
      shanksByIdentifier.value[probe.probeInterfaceIdentifier] ?? NO_SHANKS;
    return {
      probe,
      shanks,
      heightMillimeters,
      aspectRatio: getChannelMapAspectRatio(
        shanks,
        heightMillimeters,
        showLabels.value
      ),
      channelMapWindow: getProbeChannelMapWindow(probe, heightMillimeters),
      imageFraction: showLabels.value ? imageFraction : 1,
      alignmentOffsetMillimeters: getProbeAlignmentOffsetMillimeters(
        shanks,
        probe.shankAlignmentIndex
      )
    };
  })
);

/** Absolute placement of the hover tooltip inside the tab panel, or null when nothing is hovered. */
const tooltipStyle = computed(() => {
  if (!hover.value) return null;
  const { leftPixels, topPixels } = getChannelMapTooltipPosition(
    hover.value,
    {
      left: rootLeft.value,
      top: rootTop.value,
      width: rootWidth.value,
      height: rootHeight.value
    },
    { width: tooltipWidth.value, height: tooltipHeight.value }
  );
  return { left: `${leftPixels}px`, top: `${topPixels}px` };
});
</script>

<template>
  <div ref="root" class="full-height relative-position">
    <div class="column full-height no-wrap q-gutter-y-sm">
      <q-btn-toggle
        v-model="zoomSelection"
        :options="[
          { label: t('slice.zoomSmall'), value: 'small' },
          { label: t('slice.zoomMedium'), value: 'medium' },
          { label: t('slice.zoomLarge'), value: 'large' }
        ]"
        spread
        toggle-color="primary"
        class="col-auto"
      />
      <div class="col row q-gutter-sm content-start channel-maps__scroll">
        <q-card
          v-for="{
            probe,
            shanks,
            heightMillimeters,
            aspectRatio,
            channelMapWindow,
            imageFraction,
            alignmentOffsetMillimeters
          } of channelMaps"
          :key="probe.id"
          :class="[
            'channel-maps__card',
            {
              'channel-maps__card--selected':
                currentExperiment.isInspectableSelected(probe)
            }
          ]"
          @click="currentExperiment.selectedInspectable = probe"
        >
          <q-card-section :class="styles.header">
            <q-icon
              :style="{ color: probe.color }"
              name="radio_button_checked"
              size="sm"
            />
            <div :class="styles.name">{{ probe.name }}</div>
          </q-card-section>
          <q-separator />
          <q-card-section class="flex flex-center q-pa-sm">
            <div class="row no-wrap">
              <q-range
                v-if="shanks.length && zoomSelection !== 'small'"
                :model-value="channelMapWindow"
                :min="0"
                :max="heightMillimeters"
                :step="0"
                :left-label-value="
                  t('slice.millimeters', {
                    value: channelMapWindow.min.toFixed(2)
                  })
                "
                :right-label-value="
                  t('slice.millimeters', {
                    value: channelMapWindow.max.toFixed(2)
                  })
                "
                :aria-label="t('slice.channelMapWindow', { name: probe.name })"
                :style="{ height: styles.canvasHeight }"
                label
                drag-range
                vertical
                reverse
                dense
                class="col-auto q-mr-sm"
                @update:model-value="
                  value =>
                    setProbeChannelMapWindow(probe, value, heightMillimeters)
                "
              />
              <q-intersection
                v-if="shanks.length"
                :style="{ height: styles.canvasHeight, aspectRatio }"
                class="channel-maps__viewport"
              >
                <ChannelMapCanvas
                  :alignment-offset-millimeters="alignmentOffsetMillimeters"
                  :height-millimeters="heightMillimeters"
                  :image-fraction="imageFraction"
                  :probe="probe"
                  :shanks="shanks"
                  :zoom-selection="zoomSelection"
                  @hover="value => (hover = value)"
                />
              </q-intersection>
              <div
                v-else
                :style="{ height: styles.canvasHeight }"
                class="flex flex-center text-caption text-weight-light channel-maps__no-contour"
              >
                {{ t("slice.noContour") }}
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
    <div
      v-if="hover && tooltipStyle"
      ref="tooltip"
      role="tooltip"
      class="q-tooltip--style channel-maps__tooltip"
      :style="tooltipStyle"
      >{{ hover.structure.abbreviation }} - {{ hover.structure.name }}</div
    >
  </div>
</template>

<style lang="sass" scoped>
.channel-maps
  &__scroll
    overflow-y: auto

  &__card
    border: 2px solid transparent
    cursor: pointer

    &:hover
      border-color: rgba($primary, 0.4)

    &--selected,
    &--selected:hover
      border-color: $primary

  &__viewport
    min-width: 1px

    :deep(> div)
      width: 100%
      height: 100%

  &__no-contour
    width: 8rem
    text-align: center

  &__tooltip
    position: absolute
    z-index: 1
    padding: $tooltip-padding
    max-width: 100%
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis
    pointer-events: none
</style>
