import type { Manifest } from "@/features/atlas";
import { getAtlasLongestDimensionMillimeters } from "@/features/atlas";
import type { ProbeContour } from "@/features/probe";
import type { PlaneGeometry } from "../models/sample-geometry.model";
import type { ProbeFrame } from "./probe-frame.api";
import { toAtlasMillimeters } from "./probe-frame.api";

/** Log2 octaves the zoom range spans below its atlas-derived maximum. */
const SLICE_ZOOM_RANGE_OCTAVES = 6;

/**
 * Fallback log2 upper bound when the manifest hasn't resolved, or its
 * dimensions are unknown - the Allen-mouse scale (2^4 = 16mm), which this
 * formula also reproduces once the manifest is available.
 */
const FALLBACK_MAXIMUM_ZOOM_EXPONENT = 4;

/** A slice zoom range, as log2 mm exponents. */
export interface SliceZoomExponentRange {
  minimum: number;
  maximum: number;
}

/**
 * Derive the slice zoom range from an atlas's longest dimension, so the
 * range scales with atlas size instead of being tuned to one species - e.g.
 * far too wide for a fly, far too narrow for a human.
 * @param manifest Atlas manifest to derive the range from, or null if not
 *   yet resolved.
 */
export function getSliceZoomExponentRange(
  manifest: Manifest | null
): SliceZoomExponentRange {
  const longestDimensionMillimeters = manifest
    ? getAtlasLongestDimensionMillimeters(manifest)
    : 0;
  const maximum =
    longestDimensionMillimeters > 0
      ? Math.ceil(Math.log2(longestDimensionMillimeters))
      : FALLBACK_MAXIMUM_ZOOM_EXPONENT;
  return { minimum: maximum - SLICE_ZOOM_RANGE_OCTAVES, maximum };
}

/**
 * Clamp a slice extent into a zoom range.
 * @param extentMillimeters Extent to clamp, in mm.
 * @param range Zoom range to clamp into, as log2 mm exponents.
 */
export function clampSliceExtent(
  extentMillimeters: number,
  range: SliceZoomExponentRange
): number {
  return Math.min(
    Math.max(extentMillimeters, 2 ** range.minimum),
    2 ** range.maximum
  );
}

/**
 * Default slice extent for a probe whose zoom has never been set, in mm -
 * the middle of the atlas's own zoom range, which reproduces the historical
 * 2mm default on the Allen mouse while scaling to any other atlas.
 * @param range Zoom range to take the middle of, as log2 mm exponents.
 */
export function getDefaultSliceExtentMillimeters(
  range: SliceZoomExponentRange
): number {
  return 2 ** ((range.minimum + range.maximum) / 2);
}

/**
 * Build the sampling plane through a probe's shanks, centered on a height up
 * its contour from the tip.
 * @param frame Probe's shank-plane frame.
 * @param centerHeightMillimeters Height up the contour from the tip to center on, in probe-local mm.
 * @param extentMillimeters Edge length of the square plane, in mm.
 * @param sizePixels Edge length of the square output, in pixels.
 */
export function getProbeSlicePlane(
  frame: ProbeFrame,
  centerHeightMillimeters: number,
  extentMillimeters: number,
  sizePixels: number
): PlaneGeometry {
  return {
    kind: "plane",
    centerMillimeters: toAtlasMillimeters(frame, 0, centerHeightMillimeters),
    rightMillimeters: frame.rightMillimeters,
    upMillimeters: frame.upMillimeters,
    halfExtentMillimeters: extentMillimeters / 2,
    sizePixels
  };
}

/**
 * Clamp a slice center height into a contour's tip-to-top range.
 * @param centerHeightMillimeters Height up the contour from the tip, in probe-local mm.
 * @param contour Probe's contour to clamp against.
 */
export function clampSliceCenterHeight(
  centerHeightMillimeters: number,
  contour: ProbeContour
): number {
  return Math.min(
    Math.max(centerHeightMillimeters, 0),
    contour.heightMillimeters
  );
}
