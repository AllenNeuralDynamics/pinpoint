import type { ProbeShank } from "@/features/probe";
import { clamp } from "@/utils/math";
import type { SampleResult } from "../models/sample-result.model";

/** A channel map's horizontal split into its sampled shank image and its blank label gutter. */
export interface ChannelMapWidths {
  /** Total packed width of every shank, in mm. */
  shankMillimeters: number;
  /** Blank gutter reserved for structure labels, in mm. */
  gutterMillimeters: number;
  /** Fraction of the full width the shank image occupies, measured from the left. */
  imageFraction: number;
}

/** One structure's contiguous vertical run across a channel map's shanks. */
export interface StructureLabelRun {
  /** Annotation value of the structure occupying the run. */
  annotationValue: number;
  /** Fraction down the sampled image the run's midpoint sits at. */
  centerFraction: number;
  /** Samples the structure occupies inside the run, across every shank column. */
  areaPixels: number;
}

/** One placed line of a channel map's label gutter. */
export interface ChannelMapLabel {
  /** Stable key for the line, unique within a gutter. */
  key: string;
  /** Abbreviation of the structure the line names. */
  abbreviation: string;
  /** Offset from the gutter's top to the line box's top, in CSS pixels. */
  topPixels: number;
}

/** Label gutter width, as a multiple of the widest shank's width. */
const LABEL_GUTTER_SHANK_WIDTHS = 1.5;

/** CSS pixels between a channel map's right edge and its tooltip's left edge. */
const TOOLTIP_GAP_PIXELS = 8;

/** Minimum gap between two rendered gutter labels, as a multiple of a label's line height. */
const LABEL_EXCLUSION_LINE_HEIGHTS = 2;

/**
 * Split a probe's packed shank width into the sampled image and its blank
 * label gutter, sized to the widest shank.
 * @param shanks Probe shanks packed left to right.
 */
export function getChannelMapWidths(shanks: ProbeShank[]): ChannelMapWidths {
  const shankMillimeters = shanks.reduce(
    (total, shank) => total + shank.widthMillimeters,
    0
  );
  if (shankMillimeters <= 0) {
    return { shankMillimeters, gutterMillimeters: 0, imageFraction: 1 };
  }

  const gutterMillimeters =
    LABEL_GUTTER_SHANK_WIDTHS *
    Math.max(0, ...shanks.map(shank => shank.widthMillimeters));
  return {
    shankMillimeters,
    gutterMillimeters,
    imageFraction: shankMillimeters / (shankMillimeters + gutterMillimeters)
  };
}

/**
 * Scan a sample result for every structure's contiguous vertical run across
 * its shanks, as a union over columns, with each run's sampled area.
 * @param result Sampled annotation values to scan.
 */
export function getStructureLabelRuns(
  result: SampleResult
): StructureLabelRun[] {
  const { widthPixels, heightPixels, annotationValues } = result;
  const runs: StructureLabelRun[] = [];
  if (widthPixels <= 0 || heightPixels <= 0) return runs;

  /** Annotation value to its still-open run's first row and sample count. */
  const openRuns = new Map<number, { startRow: number; areaPixels: number }>();
  const rowCounts = new Map<number, number>();

  for (let row = 0; row < heightPixels; row++) {
    rowCounts.clear();
    const rowOffset = row * widthPixels;
    for (let column = 0; column < widthPixels; column++) {
      const value = annotationValues[rowOffset + column]!;
      if (value !== 0) rowCounts.set(value, (rowCounts.get(value) ?? 0) + 1);
    }

    for (const [value, open] of openRuns) {
      if (rowCounts.has(value)) continue;
      runs.push({
        annotationValue: value,
        centerFraction: (open.startRow + row) / (2 * heightPixels),
        areaPixels: open.areaPixels
      });
      openRuns.delete(value);
    }
    for (const [value, count] of rowCounts) {
      const open = openRuns.get(value);
      if (open) open.areaPixels += count;
      else openRuns.set(value, { startRow: row, areaPixels: count });
    }
  }

  for (const [value, open] of openRuns) {
    runs.push({
      annotationValue: value,
      centerFraction: (open.startRow + heightPixels) / (2 * heightPixels),
      areaPixels: open.areaPixels
    });
  }
  return runs;
}

/**
 * Place each structure run on a gutter line, keeping only the largest-area run
 * wherever two placements land closer than the label exclusion gap.
 * @param runs Structure runs to place, in scan order.
 * @param structures Abbreviations by annotation value.
 * @param gutterHeightPixels Full height of the label gutter, in CSS pixels.
 * @param lineHeightPixels Height of one label's line box, in CSS pixels.
 */
export function getChannelMapLabels(
  runs: StructureLabelRun[],
  structures: ReadonlyMap<number, { abbreviation: string }>,
  gutterHeightPixels: number,
  lineHeightPixels: number
): ChannelMapLabel[] {
  if (gutterHeightPixels <= 0 || lineHeightPixels <= 0) return [];

  const placements = runs.flatMap(run => {
    const structure = structures.get(run.annotationValue);
    if (!structure) return [];
    return [
      {
        key: `${run.annotationValue}-${run.centerFraction}`,
        annotationValue: run.annotationValue,
        abbreviation: structure.abbreviation,
        areaPixels: run.areaPixels,
        topPixels: clamp(
          run.centerFraction * gutterHeightPixels - lineHeightPixels / 2,
          0,
          Math.max(0, gutterHeightPixels - lineHeightPixels)
        )
      }
    ];
  });

  // Largest area claims its neighbourhood: sweep area-descending and reject any
  // placement landing inside an already-kept label's exclusion gap.
  placements.sort(
    (a, b) =>
      b.areaPixels - a.areaPixels ||
      a.topPixels - b.topPixels ||
      a.annotationValue - b.annotationValue
  );
  const exclusionPixels = lineHeightPixels * LABEL_EXCLUSION_LINE_HEIGHTS;
  const kept: typeof placements = [];
  for (const placement of placements) {
    const collides = kept.some(
      label => Math.abs(label.topPixels - placement.topPixels) < exclusionPixels
    );
    if (!collides) kept.push(placement);
  }

  kept.sort((a, b) => a.topPixels - b.topPixels);
  return kept.map(({ key, abbreviation, topPixels }) => ({
    key,
    abbreviation,
    topPixels
  }));
}

/**
 * Place a channel map's tooltip just right of its anchor and centred on the
 * pointer, clamped so it stays inside its container.
 * @param anchor Client-space point the tooltip hangs off.
 * @param container Client-space rect the tooltip must stay inside.
 * @param size Measured tooltip size, in CSS pixels.
 */
export function getChannelMapTooltipPosition(
  anchor: { clientX: number; clientY: number },
  container: { left: number; top: number; width: number; height: number },
  size: { width: number; height: number }
): { leftPixels: number; topPixels: number } {
  return {
    leftPixels: clamp(
      anchor.clientX - container.left + TOOLTIP_GAP_PIXELS,
      0,
      Math.max(0, container.width - size.width)
    ),
    topPixels: clamp(
      anchor.clientY - container.top - size.height / 2,
      0,
      Math.max(0, container.height - size.height)
    )
  };
}
