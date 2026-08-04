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

/** A contact's outline in probe-local mm: a closed polygon, or a circle. */
export type ProbeContactOutline = {
  /** `shank_ids` value for this contact, or null when the definition has none. */
  shankId: string | number | null;
} & (
  | { kind: "polygon"; points: { x: number; y: number }[] }
  | {
      kind: "circle";
      center: { x: number; y: number };
      radiusMillimeters: number;
    }
);

/** Conversion factor to millimeters, keyed by `ProbeInterfaceProbe.si_units`. */
const SI_UNITS_TO_MILLIMETERS: Record<string, number> = {
  m: 1000,
  mm: 1,
  um: 1e-3
};

/** Fallback conversion factor for an unrecognized `si_units` value. */
const MICROMETERS_TO_MILLIMETERS = 1e-3;

/** A contact's local axes: the unit vectors its width and height are measured along. */
interface ContactPlaneAxes {
  width: { x: number; y: number };
  height: { x: number; y: number };
}

/** Axes assumed when a definition omits `contact_plane_axes`. */
const IDENTITY_CONTACT_PLANE_AXES: ContactPlaneAxes = {
  width: { x: 1, y: 0 },
  height: { x: 0, y: 1 }
};

/** Side length used for a contact whose shape or size is unusable, in definition units. */
const DEFAULT_CONTACT_WIDTH_UNITS = 5;

/**
 * Millimeters per unit of a definition's `si_units`.
 * @param probeInterfaceProbe Definition to derive the scale from.
 */
function getProbeMillimetersPerUnit(
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
 * Reduce a definition's contacts to outlines in probe-local mm, re-origined
 * on the given origin. Empty when the definition has no usable contacts.
 * @param probeInterfaceProbe Definition to extract contact outlines from.
 * @param origin Offset subtracted from scaled coordinates, i.e. `ProbeContour.origin`.
 */
export function getProbeContactOutlines(
  probeInterfaceProbe: ProbeInterfaceProbe,
  origin: { x: number; y: number }
): ProbeContactOutline[] {
  if (!Array.isArray(probeInterfaceProbe.contact_positions)) return [];

  const scale = getProbeMillimetersPerUnit(probeInterfaceProbe);
  const outlines: ProbeContactOutline[] = [];

  probeInterfaceProbe.contact_positions.forEach((position, index) => {
    const [x, y] = position;
    if (typeof x !== "number" || typeof y !== "number") return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const center = { x: x * scale - origin.x, y: y * scale - origin.y };
    const shankId = probeInterfaceProbe.shank_ids?.[index] ?? null;
    const axes = getContactPlaneAxes(
      probeInterfaceProbe.contact_plane_axes?.[index]
    );
    const shape = probeInterfaceProbe.contact_shapes?.[index];
    const params = probeInterfaceProbe.contact_shape_params?.[index];

    if (
      shape === "circle" &&
      typeof params?.radius === "number" &&
      Number.isFinite(params.radius) &&
      params.radius > 0
    ) {
      outlines.push({
        kind: "circle",
        shankId,
        center,
        radiusMillimeters: params.radius * scale
      });
      return;
    }

    if (
      shape === "rect" &&
      typeof params?.width === "number" &&
      Number.isFinite(params.width) &&
      params.width > 0 &&
      typeof params.height === "number" &&
      Number.isFinite(params.height) &&
      params.height > 0
    ) {
      outlines.push({
        kind: "polygon",
        shankId,
        points: getRectangleVertices(
          center,
          axes,
          params.width * scale,
          params.height * scale
        )
      });
      return;
    }

    const widthUnits =
      typeof params?.width === "number" &&
      Number.isFinite(params.width) &&
      params.width > 0
        ? params.width
        : DEFAULT_CONTACT_WIDTH_UNITS;
    const widthMillimeters = widthUnits * scale;
    outlines.push({
      kind: "polygon",
      shankId,
      points: getRectangleVertices(
        center,
        axes,
        widthMillimeters,
        widthMillimeters
      )
    });
  });

  return outlines;
}

/**
 * Resolve a contact's local axes, falling back to identity when absent or
 * malformed.
 * @param rawAxes Raw `contact_plane_axes` entry for one contact.
 */
function getContactPlaneAxes(
  rawAxes: number[][] | undefined
): ContactPlaneAxes {
  if (
    !rawAxes ||
    rawAxes.length < 2 ||
    !Number.isFinite(rawAxes[0]?.[0]) ||
    !Number.isFinite(rawAxes[0]?.[1]) ||
    !Number.isFinite(rawAxes[1]?.[0]) ||
    !Number.isFinite(rawAxes[1]?.[1])
  ) {
    return IDENTITY_CONTACT_PLANE_AXES;
  }

  return {
    width: { x: rawAxes[0]![0]!, y: rawAxes[0]![1]! },
    height: { x: rawAxes[1]![0]!, y: rawAxes[1]![1]! }
  };
}

/**
 * Build a rectangle's four vertices from its center, local axes, and size,
 * in the same vertex order as probeinterface's `Probe.get_contact_vertices`.
 * @param center Rectangle center, in probe-local mm.
 * @param axes Local axes the width and height are measured along.
 * @param widthMillimeters Full width, in mm.
 * @param heightMillimeters Full height, in mm.
 */
function getRectangleVertices(
  center: { x: number; y: number },
  axes: ContactPlaneAxes,
  widthMillimeters: number,
  heightMillimeters: number
): { x: number; y: number }[] {
  const halfWidth = widthMillimeters / 2;
  const halfHeight = heightMillimeters / 2;
  const widthOffset = {
    x: axes.width.x * halfWidth,
    y: axes.width.y * halfWidth
  };
  const heightOffset = {
    x: axes.height.x * halfHeight,
    y: axes.height.y * halfHeight
  };

  return [
    {
      x: center.x - widthOffset.x - heightOffset.x,
      y: center.y - widthOffset.y - heightOffset.y
    },
    {
      x: center.x - widthOffset.x + heightOffset.x,
      y: center.y - widthOffset.y + heightOffset.y
    },
    {
      x: center.x + widthOffset.x + heightOffset.x,
      y: center.y + widthOffset.y + heightOffset.y
    },
    {
      x: center.x + widthOffset.x - heightOffset.x,
      y: center.y + widthOffset.y - heightOffset.y
    }
  ];
}

/**
 * Scale a list of raw `[x, y]` points to millimeters, dropping any that
 * aren't finite numbers.
 * @param rawPoints Raw points to scale.
 * @param scale Millimeters per unit.
 */
function scalePoints(
  rawPoints: number[][],
  scale: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  rawPoints.forEach(point => {
    const [x, y] = point;
    if (typeof x !== "number" || typeof y !== "number") return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    points.push({ x: x * scale, y: y * scale });
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
