import {
  computed,
  type ComputedRef,
  type Ref,
  type WritableComputedRef
} from "vue";
import type { Atlas } from "@/features/atlas";
import type { Probe, ProbeContour } from "@/features/probe";
import {
  clampSliceCenterHeight,
  clampSliceExtent,
  getDefaultSliceExtentMillimeters,
  getSliceZoomExponentRange,
  type SliceZoomExponentRange
} from "../api/slice-plane.api";

/** A probe's persisted slice zoom and pan, clamped to the current atlas and contour. */
export interface SliceViewport {
  zoomRange: ComputedRef<SliceZoomExponentRange>;
  extentMillimeters: ComputedRef<number>;
  zoomExponent: WritableComputedRef<number>;
  centerHeightMillimeters: WritableComputedRef<number>;
}

/**
 * Track a probe's slice zoom and center height, clamping both into the
 * current atlas's zoom range and contour, and writing changes back to the
 * probe.
 * @param probe Probe to read and write persisted viewport state on.
 * @param contour Probe's contour, or null when unavailable.
 * @param atlas Current atlas.
 */
export function useSliceViewport(
  probe: Ref<Probe>,
  contour: Ref<ProbeContour | null>,
  atlas: Ref<Atlas>
): SliceViewport {
  const zoomRange = computed(() => getSliceZoomExponentRange(atlas.value));

  const extentMillimeters = computed(() =>
    probe.value.sliceExtentMillimeters === null
      ? getDefaultSliceExtentMillimeters(zoomRange.value)
      : clampSliceExtent(probe.value.sliceExtentMillimeters, zoomRange.value)
  );

  const zoomExponent = computed({
    get: () => Math.log2(extentMillimeters.value),
    set: (value: number) => {
      probe.value.sliceExtentMillimeters = 2 ** value;
    }
  });

  const centerHeightMillimeters = computed({
    get: () =>
      contour.value
        ? clampSliceCenterHeight(
            probe.value.sliceCenterHeightMillimeters,
            contour.value
          )
        : probe.value.sliceCenterHeightMillimeters,
    set: (value: number) => {
      probe.value.sliceCenterHeightMillimeters = value;
    }
  });

  return {
    zoomRange,
    extentMillimeters,
    zoomExponent,
    centerHeightMillimeters
  };
}
