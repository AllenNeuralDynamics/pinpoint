import type { ProbeInterfaceProbe } from "../models/probe-interface.model";
import type { ProbeContactOutline, ProbeContour } from "./contour.api";
import { getProbeContactOutlines } from "./contour.api";

/** One shank of a probe, in the same probe-local mm frame as its contour. */
export interface ProbeShank {
  /** `shank_ids` value this shank groups, or null when the definition has none. */
  id: string | number | null;
  /** Closed outline rings in probe-local mm - the contour runs belonging to this shank. */
  rings: { x: number; y: number }[][];
  /** Contact outlines on this shank, in probe-local mm. */
  contacts: ProbeContactOutline[];
  /** Left edge of the shank's outline, in probe-local mm. */
  minimumXMillimeters: number;
  /** Right edge of the shank's outline, in probe-local mm. */
  maximumXMillimeters: number;
  /** Full x extent of the shank's outline, in mm. */
  widthMillimeters: number;
}

/** One `shank_ids` group's contacts and the x-range they span. */
interface ShankGroup {
  id: string | number | null;
  outlines: ProbeContactOutline[];
  minimumX: number;
  maximumX: number;
}

/**
 * Split a probe's contour and contacts into shanks, left to right. One
 * whole-contour shank when the definition has no per-shank grouping to split by.
 * @param probeInterfaceProbe Definition to read contacts and `shank_ids` from.
 * @param contour Probe's contour, whose points are split between the shanks.
 */
export function getProbeShanks(
  probeInterfaceProbe: ProbeInterfaceProbe,
  contour: ProbeContour
): ProbeShank[] {
  const outlines = getProbeContactOutlines(probeInterfaceProbe, contour.origin);
  const wholeContourShank = buildWholeContourShank(outlines, contour);

  const outlinesByShankId = new Map<
    string | number | null,
    ProbeContactOutline[]
  >();
  for (const outline of outlines) {
    const group = outlinesByShankId.get(outline.shankId);
    if (group) group.push(outline);
    else outlinesByShankId.set(outline.shankId, [outline]);
  }

  if (
    outlines.length === 0 ||
    outlines.some(outline => outline.shankId === null) ||
    outlinesByShankId.size < 2
  ) {
    return [wholeContourShank];
  }

  const groups: ShankGroup[] = Array.from(
    outlinesByShankId,
    ([id, groupOutlines]) => {
      const { minimum, maximum } = getRangeXOfOutlines(groupOutlines);
      return {
        id,
        outlines: groupOutlines,
        minimumX: minimum,
        maximumX: maximum
      };
    }
  ).sort((a, b) => a.minimumX - b.minimumX);

  const assignments = contour.points.map(point =>
    getNearestGroupIndex(point.x, groups)
  );
  const ringsByGroup = splitPointsIntoRings(
    contour.points,
    assignments,
    groups.length
  );

  const shanks: ProbeShank[] = [];
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!;
    const rings = ringsByGroup[index]!;
    if (rings.length === 0) return [wholeContourShank];

    const { minimum, maximum } = getRangeXOfPoints(rings.flat());
    const widthMillimeters = maximum - minimum;
    if (widthMillimeters <= 0) return [wholeContourShank];

    shanks.push({
      id: group.id,
      rings,
      contacts: group.outlines,
      minimumXMillimeters: minimum,
      maximumXMillimeters: maximum,
      widthMillimeters
    });
  }

  return shanks;
}

/**
 * Build the fallback shank spanning a probe's whole contour, used both when
 * there's no per-shank grouping and when a split attempt turns out degenerate.
 * @param outlines Every contact outline on the probe.
 * @param contour Probe's contour.
 */
function buildWholeContourShank(
  outlines: ProbeContactOutline[],
  contour: ProbeContour
): ProbeShank {
  const distinctShankIds = new Set(outlines.map(outline => outline.shankId));
  const id = distinctShankIds.size === 1 ? outlines[0]!.shankId : null;
  const { minimum, maximum } = getRangeXOfPoints(contour.points);

  return {
    id,
    rings: [contour.points],
    contacts: outlines,
    minimumXMillimeters: minimum,
    maximumXMillimeters: maximum,
    widthMillimeters: maximum - minimum
  };
}

/**
 * Compute the x-range a group of contact outlines spans: min/max over a
 * polygon's vertices, or a circle's center +/- its radius.
 * @param outlines Outlines belonging to one shank group.
 */
function getRangeXOfOutlines(outlines: ProbeContactOutline[]): {
  minimum: number;
  maximum: number;
} {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const outline of outlines) {
    const range =
      outline.kind === "polygon"
        ? getRangeXOfPoints(outline.points)
        : {
            minimum: outline.center.x - outline.radiusMillimeters,
            maximum: outline.center.x + outline.radiusMillimeters
          };
    if (range.minimum < minimum) minimum = range.minimum;
    if (range.maximum > maximum) maximum = range.maximum;
  }
  return { minimum, maximum };
}

/**
 * Compute the x-range spanned by a list of points.
 * @param points Points to measure.
 */
function getRangeXOfPoints(points: { x: number; y: number }[]): {
  minimum: number;
  maximum: number;
} {
  let minimum = points[0]!.x;
  let maximum = minimum;
  for (const { x } of points) {
    if (x < minimum) minimum = x;
    if (x > maximum) maximum = x;
  }
  return { minimum, maximum };
}

/**
 * Index of the shank group whose x-range is nearest an x coordinate, ties
 * keeping the earlier (leftmost) group.
 * @param x Coordinate to place, in probe-local mm.
 * @param groups Shank groups, ordered left to right.
 */
function getNearestGroupIndex(x: number, groups: ShankGroup[]): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  groups.forEach((group, index) => {
    const distance =
      x < group.minimumX
        ? group.minimumX - x
        : x > group.maximumX
          ? x - group.maximumX
          : 0;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/**
 * Cut a closed point loop into maximal circular runs of equal group
 * assignment, bucketed by group index. A run may wrap the array end, so the
 * walk starts at the first assignment change instead of index 0.
 * @param points Closed point loop to split.
 * @param assignments Group index per point, index-aligned with `points`.
 * @param groupCount Number of groups, sizing the returned bucket array.
 */
function splitPointsIntoRings(
  points: { x: number; y: number }[],
  assignments: number[],
  groupCount: number
): { x: number; y: number }[][][] {
  const ringsByGroup: { x: number; y: number }[][][] = Array.from(
    { length: groupCount },
    () => []
  );
  const pointCount = points.length;
  if (pointCount === 0) return ringsByGroup;

  let start = 0;
  for (let i = 0; i < pointCount; i++) {
    const previous = assignments[(i - 1 + pointCount) % pointCount]!;
    if (assignments[i] !== previous) {
      start = i;
      break;
    }
  }

  let currentRun: { x: number; y: number }[] = [];
  let currentGroup = assignments[start]!;
  for (let step = 0; step < pointCount; step++) {
    const index = (start + step) % pointCount;
    const group = assignments[index]!;
    if (group !== currentGroup) {
      ringsByGroup[currentGroup]!.push(currentRun);
      currentRun = [];
      currentGroup = group;
    }
    currentRun.push(points[index]!);
  }
  ringsByGroup[currentGroup]!.push(currentRun);

  return ringsByGroup;
}
