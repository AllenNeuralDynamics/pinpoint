import type { ProbeInterfaceProbe } from "../models/probe-interface.model";

/** A probe's planar contour in millimeters, re-origined on its center tip. */
export interface ProbeContour {
  /** Contour points in probe-local mm: x across the shanks, y up from the tip. */
  points: { x: number; y: number }[];
  /** Full x extent of the contour, in mm. */
  widthMillimeters: number;
  /** Distance from the center tip to the top of the contour, in mm. */
  heightMillimeters: number;
  /** Offset subtracted from scaled probe-definition coordinates to reach local space, in mm. */
  origin: { x: number; y: number };
}

/** A probe's contacts, in the same probe-local mm frame as its contour. */
export interface ProbeContacts {
  /** Contact centers in probe-local mm, in `contact_positions` order (with any unusable points dropped). */
  points: { x: number; y: number }[];
  /** Contact bounding box center - what a view should frame on. */
  centerMillimeters: { x: number; y: number };
  /** Full x extent of the contacts, in mm. */
  widthMillimeters: number;
  /** Full y extent of the contacts, in mm. */
  heightMillimeters: number;
  /** Per-contact shank grouping from `shank_ids`, index-aligned with `points`, or null when absent. */
  shankIds: (string | number)[] | null;
}

/** Conversion factor to millimeters, keyed by `ProbeInterfaceProbe.si_units`. */
const SI_UNITS_TO_MILLIMETERS: Record<string, number> = {
  m: 1000,
  mm: 1,
  um: 1e-3
};

/** Fallback conversion factor for an unrecognized `si_units` value. */
const MICROMETERS_TO_MILLIMETERS = 1e-3;

/**
 * Millimeters per unit of a definition's `si_units`.
 * @param probeInterfaceProbe Definition to derive the scale from.
 */
export function getProbeMillimetersPerUnit(
  probeInterfaceProbe: ProbeInterfaceProbe
): number {
  return (
    SI_UNITS_TO_MILLIMETERS[probeInterfaceProbe.si_units] ??
    MICROMETERS_TO_MILLIMETERS
  );
}

/**
 * Reduce a definition's planar contour to millimeters, re-origined on its
 * center tip. Null when the contour is missing or has fewer than 3 usable
 * points.
 * @param probeInterfaceProbe Definition to extract the contour from.
 */
export function getProbeContour(
  probeInterfaceProbe: ProbeInterfaceProbe
): ProbeContour | null {
  const contour = probeInterfaceProbe.probe_planar_contour;
  if (!contour) return null;

  const scale = getProbeMillimetersPerUnit(probeInterfaceProbe);

  const points = scalePoints(contour, scale);
  if (points.length < 3) return null;

  const { minimumX, maximumX, minimumY, maximumY } = boundingBox(points);
  const centerX = (minimumX + maximumX) / 2;

  return {
    points: points.map(({ x, y }) => ({ x: x - centerX, y: y - minimumY })),
    widthMillimeters: maximumX - minimumX,
    heightMillimeters: maximumY - minimumY,
    origin: { x: centerX, y: minimumY }
  };
}

/**
 * Reduce a definition's contacts to millimeters, in the same probe-local
 * frame as its contour (or, when there's no contour, in a frame centered on
 * the contacts' own bounding box). Null when there are no usable contacts.
 * @param probeInterfaceProbe Definition to extract contacts from.
 */
export function getProbeContacts(
  probeInterfaceProbe: ProbeInterfaceProbe
): ProbeContacts | null {
  const scale = getProbeMillimetersPerUnit(probeInterfaceProbe);

  const validIndices: number[] = [];
  const points = scalePoints(
    probeInterfaceProbe.contact_positions,
    scale,
    validIndices
  );
  if (points.length === 0) return null;

  const contour = getProbeContour(probeInterfaceProbe);
  const rawBounds = boundingBox(points);
  const origin = contour
    ? contour.origin
    : {
        x: (rawBounds.minimumX + rawBounds.maximumX) / 2,
        y: rawBounds.minimumY
      };

  const localPoints = points.map(({ x, y }) => ({
    x: x - origin.x,
    y: y - origin.y
  }));
  const { minimumX, maximumX, minimumY, maximumY } = boundingBox(localPoints);

  const shankIds = probeInterfaceProbe.shank_ids
    ? validIndices.map(index => probeInterfaceProbe.shank_ids![index]!)
    : null;

  return {
    points: localPoints,
    centerMillimeters: {
      x: (minimumX + maximumX) / 2,
      y: (minimumY + maximumY) / 2
    },
    widthMillimeters: maximumX - minimumX,
    heightMillimeters: maximumY - minimumY,
    shankIds
  };
}

/**
 * Scale a list of raw `[x, y]` points to millimeters, dropping any that
 * aren't finite numbers.
 * @param rawPoints Raw points to scale.
 * @param scale Millimeters per unit.
 * @param validIndices When given, filled with each kept point's original index.
 */
function scalePoints(
  rawPoints: number[][],
  scale: number,
  validIndices?: number[]
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  rawPoints.forEach((point, index) => {
    const [x, y] = point;
    if (typeof x !== "number" || typeof y !== "number") return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    points.push({ x: x * scale, y: y * scale });
    validIndices?.push(index);
  });
  return points;
}

/**
 * Compute the axis-aligned bounding box of a list of points.
 * @param points Points to bound.
 */
function boundingBox(points: { x: number; y: number }[]): {
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
} {
  let minimumX = points[0]!.x;
  let maximumX = minimumX;
  let minimumY = points[0]!.y;
  let maximumY = minimumY;
  for (const { x, y } of points) {
    if (x < minimumX) minimumX = x;
    if (x > maximumX) maximumX = x;
    if (y < minimumY) minimumY = y;
    if (y > maximumY) maximumY = y;
  }
  return { minimumX, maximumX, minimumY, maximumY };
}
