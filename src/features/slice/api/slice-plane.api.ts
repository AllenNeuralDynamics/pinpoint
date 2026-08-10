import {
  type Atlas,
  getAtlasLongestDimensionMillimeters
} from "@/features/atlas";
import type {
  Probe,
  ProbeChannelMapWindow,
  ProbeContactOutline,
  ProbeContour,
  ProbeShank
} from "@/features/probe";
import { clamp } from "@/utils/math";
import type { SampleGeometry } from "../models/sample-geometry.model";
import type { ProbeFrame } from "./probe-frame.api";
import { toAtlasMillimeters } from "./probe-frame.api";

/** A slice zoom range, as log2 mm exponents. */
export interface SliceZoomExponentRange {
  minimum: number;
  maximum: number;
}

/** One shank's placement in a packed multi-shank slice. */
export interface ShankPlacement {
  shank: ProbeShank;
  /** First output column this shank fills, inclusive. */
  columnOffset: number;
  /** Output columns this shank fills. */
  columnCount: number;
  /** mm the shank's mirrored probe-local x is added to, to place it in packed image space: packed x = offsetMillimeters - probe-local x. */
  offsetMillimeters: number;
}

/** A packed multi-shank slice layout: one shared scale plus per-shank placements. */
export interface ShankLayout {
  /** Placements in ascending probe-local x, i.e. right to left across the image; consecutive placements may leave an unsampled gap between them. */
  placements: ShankPlacement[];
  /** Total output width, in pixels. */
  widthPixels: number;
  /** Output height, in pixels. */
  heightPixels: number;
  /** Output columns per packed mm along x, shared by every shank. */
  pixelsPerMillimeter: number;
  /** Full packed x extent, in mm - `widthPixels / pixelsPerMillimeter`. */
  widthMillimeters: number;
}

/** Log2 octaves the zoom range spans below its atlas-derived maximum. */
const SLICE_ZOOM_RANGE_OCTAVES = 6;

/**
 * Fallback log2 upper bound when the atlas's dimensions are unknown.
 */
const FALLBACK_MAXIMUM_ZOOM_EXPONENT = 4;

/** Device-pixel edge lengths the slice canvas is quantized to. */
const MINIMUM_SIZE_PIXELS = 128;
const MAXIMUM_SIZE_PIXELS = 1024;
const SIZE_QUANTUM_PIXELS = 32;

/** Blank device pixels left between adjacent shanks in a packed layout. */
const SHANK_GAP_PIXELS = 1;

/**
 * Smallest channel map window the range may collapse to, in mm - about one
 * atlas voxel, past which more zoom reveals no new detail.
 */
const MINIMUM_CHANNEL_MAP_WINDOW_MILLIMETERS = 0.05;

/**
 * Derive the slice zoom range from an atlas's longest dimension.
 * @param atlas Atlas to derive the range from.
 */
export function getSliceZoomExponentRange(
  atlas: Atlas
): SliceZoomExponentRange {
  const longestDimensionMillimeters =
    getAtlasLongestDimensionMillimeters(atlas);
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
  return clamp(extentMillimeters, 2 ** range.minimum, 2 ** range.maximum);
}

/**
 * Default slice extent for a probe whose zoom has never been set, in mm.
 * @param range Zoom range to take the middle of, as log2 mm exponents.
 */
export function getDefaultSliceExtentMillimeters(
  range: SliceZoomExponentRange
): number {
  return 2 ** ((range.minimum + range.maximum) / 2);
}

/**
 * Build the sampling rectangle through a probe's shanks, centered on a
 * height up its contour from the tip - the square case of {@link SampleGeometry}.
 * @param frame Probe's shank-plane frame.
 * @param centerHeightMillimeters Height up the contour from the tip to center on, in probe-local mm.
 * @param extentMillimeters Edge length of the square rectangle, in mm.
 * @param sizePixels Edge length of the square output, in pixels.
 */
export function getProbeSlicePlane(
  frame: ProbeFrame,
  centerHeightMillimeters: number,
  extentMillimeters: number,
  sizePixels: number
): SampleGeometry {
  return {
    rightMillimeters: getImageRightMillimeters(frame),
    upMillimeters: frame.upMillimeters,
    halfHeightMillimeters: extentMillimeters / 2,
    widthPixels: sizePixels,
    heightPixels: sizePixels,
    bands: [
      {
        centerMillimeters: toAtlasMillimeters(
          frame,
          0,
          centerHeightMillimeters
        ),
        halfWidthMillimeters: extentMillimeters / 2,
        columnOffset: 0,
        columnCount: sizePixels
      }
    ]
  };
}

/**
 * Pack a probe's shanks right to left across probe-local x into one output
 * image, at the shanks' true aspect ratio and a height quantized like every
 * other slice canvas, leaving a blank gap between adjacent shanks.
 * Null while unmeasured or when there is nothing with width to draw.
 * @param shanks Shanks to pack, ascending by probe-local x.
 * @param heightMillimeters Height of the probe's contour, spanned by every shank.
 * @param cssHeight Canvas height in CSS pixels; 0 while unmeasured.
 * @param pixelRatio Device pixel ratio.
 */
export function getShankLayout(
  shanks: ProbeShank[],
  heightMillimeters: number,
  cssHeight: number,
  pixelRatio: number
): ShankLayout | null {
  if (cssHeight <= 0 || heightMillimeters <= 0 || shanks.length === 0) {
    return null;
  }

  const heightPixels = clamp(
    Math.floor((cssHeight * pixelRatio) / SIZE_QUANTUM_PIXELS) *
      SIZE_QUANTUM_PIXELS,
    MINIMUM_SIZE_PIXELS,
    MAXIMUM_SIZE_PIXELS
  );

  const totalWidthMillimeters = shanks.reduce(
    (total, shank) => total + shank.widthMillimeters,
    0
  );
  if (totalWidthMillimeters <= 0) return null;

  const totalGapPixels = SHANK_GAP_PIXELS * (shanks.length - 1);
  let pixelsPerMillimeter = heightPixels / heightMillimeters;
  if (
    totalWidthMillimeters * pixelsPerMillimeter + totalGapPixels >
    MAXIMUM_SIZE_PIXELS
  ) {
    pixelsPerMillimeter =
      (MAXIMUM_SIZE_PIXELS - totalGapPixels) / totalWidthMillimeters;
  }

  const columnCounts = shanks.map(shank =>
    Math.max(1, Math.round(shank.widthMillimeters * pixelsPerMillimeter))
  );
  const widthPixels =
    columnCounts.reduce((total, count) => total + count, 0) + totalGapPixels;

  // Columns run right to left across probe-local x: the image's +x is probe-local -X, so the
  // greatest-x shank fills the leftmost columns.
  const placements: ShankPlacement[] = [];
  let columnOffset = widthPixels;
  for (const [index, shank] of shanks.entries()) {
    const columnCount = columnCounts[index]!;
    columnOffset -= columnCount;
    placements.push({
      shank,
      columnOffset,
      columnCount,
      offsetMillimeters:
        columnOffset / pixelsPerMillimeter + shank.maximumXMillimeters
    });
    if (index < shanks.length - 1) columnOffset -= SHANK_GAP_PIXELS;
  }

  return {
    placements,
    widthPixels,
    heightPixels,
    pixelsPerMillimeter,
    widthMillimeters: widthPixels / pixelsPerMillimeter
  };
}

/**
 * Build the sampling surface for a packed multi-shank slice: one band per
 * shank, each centered on its own x and on the channel map window's center,
 * spanning only that window vertically.
 * @param frame Probe's shank-plane frame.
 * @param layout Packed layout the bands take their x columns and scale from.
 * @param channelMapWindow Window along the shank the bands span vertically.
 * @param alignmentOffsetMillimeters Probe-local x the geometry is shifted by, from getProbeAlignmentOffsetMillimeters.
 */
export function getShankSliceGeometry(
  frame: ProbeFrame,
  layout: ShankLayout,
  channelMapWindow: ProbeChannelMapWindow,
  alignmentOffsetMillimeters: number
): SampleGeometry {
  const centerHeightMillimeters =
    (channelMapWindow.min + channelMapWindow.max) / 2;
  return {
    rightMillimeters: getImageRightMillimeters(frame),
    upMillimeters: frame.upMillimeters,
    halfHeightMillimeters: (channelMapWindow.max - channelMapWindow.min) / 2,
    widthPixels: layout.widthPixels,
    heightPixels: layout.heightPixels,
    bands: layout.placements.map(placement => ({
      centerMillimeters: toAtlasMillimeters(
        frame,
        (placement.shank.minimumXMillimeters +
          placement.shank.maximumXMillimeters) /
          2 +
          alignmentOffsetMillimeters,
        centerHeightMillimeters
      ),
      halfWidthMillimeters:
        placement.columnCount / (2 * layout.pixelsPerMillimeter),
      columnOffset: placement.columnOffset,
      columnCount: placement.columnCount
    }))
  };
}

/**
 * Unit ASR direction of a rendered image's +x axis: probe-local -X, so the
 * image looks along the contacts' outward normal (probe-local -Y, the
 * head-stage cut side).
 * @param frame Probe frame whose right axis to mirror.
 */
function getImageRightMillimeters(frame: ProbeFrame): [number, number, number] {
  return [
    -frame.rightMillimeters[0],
    -frame.rightMillimeters[1],
    -frame.rightMillimeters[2]
  ];
}

/**
 * Resolve a probe's channel map window against its contour height,
 * defaulting an unset window to the full height and clamping a persisted one
 * into range.
 * @param probe Probe to read the persisted window from.
 * @param heightMillimeters Height of the probe's contour, in mm.
 */
export function getProbeChannelMapWindow(
  probe: Probe,
  heightMillimeters: number
): ProbeChannelMapWindow {
  return probe.channelMapWindow === null
    ? { min: 0, max: heightMillimeters }
    : clampChannelMapWindow(probe.channelMapWindow, heightMillimeters);
}

/**
 * Write a channel map window to a probe in place, clamped into its contour
 * height and to the minimum window span.
 * @param probe Probe to write the window to.
 * @param channelMapWindow Window to write, in mm up from the tip.
 * @param heightMillimeters Height of the probe's contour, in mm.
 */
export function setProbeChannelMapWindow(
  probe: Probe,
  channelMapWindow: ProbeChannelMapWindow,
  heightMillimeters: number
): void {
  probe.channelMapWindow = clampChannelMapWindow(
    channelMapWindow,
    heightMillimeters
  );
}

/**
 * Clamp a channel map window inside `[0, heightMillimeters]`, holding its
 * span at or above the minimum window.
 * @param channelMapWindow Window to clamp, in mm up from the tip.
 * @param heightMillimeters Height of the probe's contour, in mm.
 */
function clampChannelMapWindow(
  channelMapWindow: ProbeChannelMapWindow,
  heightMillimeters: number
): ProbeChannelMapWindow {
  if (heightMillimeters <= MINIMUM_CHANNEL_MAP_WINDOW_MILLIMETERS) {
    return { min: 0, max: heightMillimeters };
  }

  const span = clamp(
    channelMapWindow.max - channelMapWindow.min,
    MINIMUM_CHANNEL_MAP_WINDOW_MILLIMETERS,
    heightMillimeters
  );
  const min = clamp(channelMapWindow.min, 0, heightMillimeters - span);
  return { min, max: min + span };
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
  return clamp(centerHeightMillimeters, 0, contour.heightMillimeters);
}

/**
 * Quantize a canvas's device-pixel width into the bounded edge length the
 * slice is sampled at, so small resizes don't trigger a replan.
 * @param cssWidth Canvas element width, in CSS pixels.
 * @param pixelRatio Device pixel ratio.
 */
export function getQuantizedSizePixels(
  cssWidth: number,
  pixelRatio: number
): number {
  if (cssWidth === 0) return 0;
  const devicePixels = cssWidth * pixelRatio;
  const quantized =
    Math.floor(devicePixels / SIZE_QUANTUM_PIXELS) * SIZE_QUANTUM_PIXELS;
  return clamp(quantized, MINIMUM_SIZE_PIXELS, MAXIMUM_SIZE_PIXELS);
}

/**
 * Build the SVG polygon `points` for a contour overlay, in image mm - x
 * mirrored from probe-local x so the view looks along the contacts' outward
 * normal, y flipped about the slice center height.
 * @param contour Probe contour to render.
 * @param centerHeightMillimeters Height the slice is currently centered on, in probe-local mm.
 * @param alignmentOffsetMillimeters Probe-local x the geometry is shifted by, from getProbeAlignmentOffsetMillimeters.
 */
export function getContourPolygonPoints(
  contour: ProbeContour,
  centerHeightMillimeters: number,
  alignmentOffsetMillimeters: number
): string {
  return contour.points
    .map(
      ({ x, y }) =>
        `${-(x + alignmentOffsetMillimeters)},${centerHeightMillimeters - y}`
    )
    .join(" ");
}

/**
 * Build the SVG path `d` for a shank's outline, in image mm - x mirrored
 * from probe-local x so the view looks along the contacts' outward normal,
 * y flipped about the slice center height. Multiple rings become extra
 * closed subpaths.
 * @param shank Shank whose outline rings to render.
 * @param centerHeightMillimeters Height the slice is centered on, in probe-local mm.
 */
export function getShankOutlinePath(
  shank: ProbeShank,
  centerHeightMillimeters: number
): string {
  return shank.rings
    .map(ring => getPolygonSubpath(ring, centerHeightMillimeters))
    .join(" ");
}

/**
 * Build the SVG path `d` for a contact overlay, in image mm - x mirrored
 * from probe-local x so the view looks along the contacts' outward normal,
 * y flipped about the slice center height. Empty when there are no outlines.
 * @param outlines Contact outlines to render, in probe-local mm.
 * @param centerHeightMillimeters Height the slice is centered on, in probe-local mm.
 */
export function getContactOutlinePath(
  outlines: ProbeContactOutline[],
  centerHeightMillimeters: number
): string {
  return outlines
    .map(outline =>
      outline.kind === "polygon"
        ? getPolygonSubpath(outline.points, centerHeightMillimeters)
        : getCircleSubpath(
            outline.center,
            outline.radiusMillimeters,
            centerHeightMillimeters
          )
    )
    .join(" ");
}

/**
 * Build one closed polygon subpath, in image mm - x mirrored from
 * probe-local x so the view looks along the contacts' outward normal, y
 * flipped about the slice center height.
 * @param points Polygon vertices, in probe-local mm.
 * @param centerHeightMillimeters Height the slice is centered on, in probe-local mm.
 */
function getPolygonSubpath(
  points: { x: number; y: number }[],
  centerHeightMillimeters: number
): string {
  return `M${points.map(({ x, y }) => `${-x},${centerHeightMillimeters - y}`).join("L")}Z`;
}

/**
 * Build one closed circle subpath as two semicircular arcs, in image mm - x
 * mirrored from probe-local x so the view looks along the contacts' outward
 * normal, y flipped about the slice center height.
 * @param center Circle center, in probe-local mm.
 * @param radiusMillimeters Circle radius, in mm.
 * @param centerHeightMillimeters Height the slice is centered on, in probe-local mm.
 */
function getCircleSubpath(
  center: { x: number; y: number },
  radiusMillimeters: number,
  centerHeightMillimeters: number
): string {
  const cy = centerHeightMillimeters - center.y;
  const left = -center.x - radiusMillimeters;
  const right = -center.x + radiusMillimeters;
  return `M${left},${cy}A${radiusMillimeters},${radiusMillimeters} 0 0,1 ${right},${cy}A${radiusMillimeters},${radiusMillimeters} 0 0,1 ${left},${cy}Z`;
}

/**
 * Map a pointer position to a device-pixel coordinate on the slice canvas,
 * or null when outside the canvas's bounds.
 * @param rect Canvas element's bounding rect.
 * @param clientX Pointer's viewport x coordinate.
 * @param clientY Pointer's viewport y coordinate.
 * @param widthPixels Edge length of the slice along u, in pixels.
 * @param heightPixels Edge length of the slice along v, in pixels.
 */
export function getSlicePixelFromRect(
  rect: DOMRect,
  clientX: number,
  clientY: number,
  widthPixels: number,
  heightPixels: number
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;

  const x = Math.floor(((clientX - rect.left) / rect.width) * widthPixels);
  const y = Math.floor(((clientY - rect.top) / rect.height) * heightPixels);
  if (x < 0 || y < 0 || x >= widthPixels || y >= heightPixels) return null;
  return { x, y };
}

/**
 * Format a slice extent for display, rounded to avoid runs of float noise.
 * @param extentMillimeters Extent to format, in mm.
 */
export function formatSliceExtentMillimeters(
  extentMillimeters: number
): string {
  return Number(extentMillimeters.toPrecision(2)).toString();
}
