import type { AnnotationLevel } from "../models/annotation-level.model";
import type { SampleGeometry } from "../models/sample-geometry.model";
import type { ProbeFrame } from "./probe-frame.api";

/** Samples one ray geometry, resolving dense annotation values, or null when unavailable. */
export type RaySampler = (
  geometry: SampleGeometry
) => Promise<Uint32Array | null>;

/** Tip targets that put a probe on the brain surface, in atlas ASR mm. */
export interface ProbeSurfaceTargets {
  /** Target when the probe already crosses brain along local +Z, else null. */
  insideMillimeters: [number, number, number] | null;
  /** Target moving forward along probe-local -Z, else null. */
  axisMillimeters: [number, number, number] | null;
  /** Target moving down on DV (global -Y), else null. */
  dorsoventralMillimeters: [number, number, number] | null;
}

/** A ray's one-column sampling geometry plus the mapping from output row to distance. */
interface RayMarch {
  geometry: SampleGeometry;
  /** Distance along the ray of output row 0, in mm. */
  firstMillimeters: number;
  /** Signed distance change per output row, in mm - always negative. */
  stepMillimeters: number;
}

/** Direction of increasing atlas DV (inferior, global -Y), in atlas ASR mm. */
const DORSOVENTRAL_DIRECTION: [number, number, number] = [0, 1, 0];

/** Ray samples per voxel along a level's finest axis, so a sample can't skip a voxel. */
const RAY_SAMPLES_PER_VOXEL = 2;

/** Pitch at which probe-local -Z is the DV direction, collapsing the two paths into one. */
const PITCH_ALONG_DORSOVENTRAL = Math.PI / 2;

/**
 * Resolve where a probe's tip must move to sit on the brain surface.
 * @param frame Probe's shank-plane frame, in atlas ASR mm.
 * @param pitchRadians Probe's pitch, i.e. `probe.rotation[2]`.
 * @param level Annotation level to march through.
 * @param sampleRay Samples one ray geometry.
 */
export async function findProbeSurfaceTargets(
  frame: ProbeFrame,
  pitchRadians: number,
  level: AnnotationLevel,
  sampleRay: RaySampler
): Promise<ProbeSurfaceTargets> {
  const origin = frame.originMillimeters;
  const up = frame.upMillimeters;

  const inside = await findRayTarget(level, origin, up, "furthest", sampleRay);
  if (inside) {
    return {
      insideMillimeters: inside,
      axisMillimeters: null,
      dorsoventralMillimeters: null
    };
  }

  // At this exact pitch probe-local -Z and the DV direction are the same
  // line, so marching the axis too would just repeat the DV march.
  if (pitchRadians === PITCH_ALONG_DORSOVENTRAL) {
    return {
      insideMillimeters: null,
      axisMillimeters: null,
      dorsoventralMillimeters: await findRayTarget(
        level,
        origin,
        DORSOVENTRAL_DIRECTION,
        "nearest",
        sampleRay
      )
    };
  }

  const down: [number, number, number] = [-up[0], -up[1], -up[2]];
  const [axisMillimeters, dorsoventralMillimeters] = await Promise.all([
    findRayTarget(level, origin, down, "nearest", sampleRay),
    findRayTarget(level, origin, DORSOVENTRAL_DIRECTION, "nearest", sampleRay)
  ]);

  return { insideMillimeters: null, axisMillimeters, dorsoventralMillimeters };
}

/** Build a ray's sampling geometry, clipped to a level's voxel bounds. Null when it misses. */
function getRayMarch(
  level: AnnotationLevel,
  originMillimeters: [number, number, number],
  directionMillimeters: [number, number, number]
): RayMarch | null {
  // The ray starts at the tip and only goes forward.
  let near = 0;
  let far = Infinity;

  for (let axis = 0; axis < 3; axis++) {
    const lo = level.translationMillimeters[axis]!;
    const hi = lo + level.shapeVoxels[axis]! * level.scaleMillimeters[axis]!;
    const origin = originMillimeters[axis]!;
    const direction = directionMillimeters[axis]!;

    if (direction === 0) {
      if (origin < lo || origin >= hi) return null;
      continue;
    }

    const t0 = (lo - origin) / direction;
    const t1 = (hi - origin) / direction;
    near = Math.max(near, Math.min(t0, t1));
    far = Math.min(far, Math.max(t0, t1));
  }

  if (far <= near) return null;

  const length = far - near;
  const heightPixels = Math.max(
    1,
    Math.ceil(
      (length * RAY_SAMPLES_PER_VOXEL) / Math.min(...level.scaleMillimeters)
    )
  );
  const stepV = length / heightPixels;

  return {
    geometry: {
      // Unused: halfWidthMillimeters is 0, so every column is the band center.
      rightMillimeters: [1, 0, 0],
      upMillimeters: directionMillimeters,
      halfHeightMillimeters: length / 2,
      widthPixels: 1,
      heightPixels,
      bands: [
        {
          centerMillimeters: pointOnRay(
            originMillimeters,
            directionMillimeters,
            near + length / 2
          ),
          halfWidthMillimeters: 0,
          columnOffset: 0,
          columnCount: 1
        }
      ]
    },
    firstMillimeters: far - 0.5 * stepV,
    stepMillimeters: -stepV
  };
}

/**
 * Tip target on a ray: the point on the ray closest to the center of the nearest or
 * furthest non-background voxel it crosses. Null when it crosses none.
 */
async function findRayTarget(
  level: AnnotationLevel,
  originMillimeters: [number, number, number],
  directionMillimeters: [number, number, number],
  pick: "nearest" | "furthest",
  sampleRay: RaySampler
): Promise<[number, number, number] | null> {
  const march = getRayMarch(level, originMillimeters, directionMillimeters);
  if (!march) return null;

  const values = await sampleRay(march.geometry);
  if (!values) return null;

  // planSamples puts row 0 at the +up edge (furthest along the direction)
  // and marches toward -up (nearest), so "furthest" takes the lowest
  // non-zero index and "nearest" the highest.
  let row = -1;
  if (pick === "furthest") {
    for (let index = 0; index < values.length; index++) {
      if (values[index]) {
        row = index;
        break;
      }
    }
  } else {
    for (let index = values.length - 1; index >= 0; index--) {
      if (values[index]) {
        row = index;
        break;
      }
    }
  }
  if (row === -1) return null;

  const distance = march.firstMillimeters + row * march.stepMillimeters;
  if (distance <= 0) return null;

  // Snap to the voxel center, then project back onto the ray so the move
  // stays purely along the requested axis (a DV move must change only DV,
  // an axis move only the axis).
  const point = pointOnRay(originMillimeters, directionMillimeters, distance);
  const center: [number, number, number] = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    const voxel = Math.floor(
      (point[axis]! - level.translationMillimeters[axis]!) /
        level.scaleMillimeters[axis]!
    );
    center[axis] =
      level.translationMillimeters[axis]! +
      (voxel + 0.5) * level.scaleMillimeters[axis]!;
  }
  const t =
    (center[0] - originMillimeters[0]) * directionMillimeters[0] +
    (center[1] - originMillimeters[1]) * directionMillimeters[1] +
    (center[2] - originMillimeters[2]) * directionMillimeters[2];
  if (t <= 0) return null;

  return pointOnRay(originMillimeters, directionMillimeters, t);
}

/**
 * Point at a distance along a ray from its origin.
 * @param originMillimeters Ray origin, in atlas ASR mm.
 * @param directionMillimeters Unit ray direction, in atlas ASR mm.
 * @param distance Distance along the ray, in mm.
 */
function pointOnRay(
  originMillimeters: [number, number, number],
  directionMillimeters: [number, number, number],
  distance: number
): [number, number, number] {
  return [
    originMillimeters[0] + directionMillimeters[0] * distance,
    originMillimeters[1] + directionMillimeters[1] * distance,
    originMillimeters[2] + directionMillimeters[2] * distance
  ];
}

// Face neighbours of the center voxel (index 13) in the 3x3x3 sampling below,
// where index = (1 - dDV) * 9 + (dAP + 1) * 3 + (dML + 1): -AP, +AP, +DV, -DV, -ML, +ML.
const FACE_NEIGHBOR_INDEXES = [10, 16, 4, 22, 12, 14];

/**
 * Is a point inside an annotated voxel that touches background on at least one
 * face, i.e. on the atlas's outer shell. Null when the volume can't be sampled.
 * @param level Annotation level to test against, finest first.
 * @param pointMillimeters Point to test, in atlas ASR mm.
 * @param sampleNeighborhood Samples the 3x3x3 voxel block around the point.
 */
export async function isOnAnnotationSurface(
  level: AnnotationLevel,
  pointMillimeters: [number, number, number],
  sampleNeighborhood: RaySampler
): Promise<boolean | null> {
  const values = await sampleNeighborhood(
    getVoxelNeighborhoodGeometry(level, pointMillimeters)
  );
  if (!values) return null;

  return (
    values[13] !== 0 && FACE_NEIGHBOR_INDEXES.some(index => values[index] === 0)
  );
}

/** Center of the voxel a point falls in, in atlas ASR mm. */
function getVoxelCenterMillimeters(
  level: AnnotationLevel,
  pointMillimeters: [number, number, number]
): [number, number, number] {
  const scale = level.scaleMillimeters;
  const center: [number, number, number] = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    const voxel = Math.floor(
      (pointMillimeters[axis]! - level.translationMillimeters[axis]!) /
        scale[axis]!
    );
    center[axis] =
      level.translationMillimeters[axis]! + (voxel + 0.5) * scale[axis]!;
  }
  return center;
}

/** Build the sampling geometry for the 3x3x3 voxel neighborhood centered on a point's voxel. */
function getVoxelNeighborhoodGeometry(
  level: AnnotationLevel,
  pointMillimeters: [number, number, number]
): SampleGeometry {
  const scale = level.scaleMillimeters;
  const center = getVoxelCenterMillimeters(level, pointMillimeters);

  return {
    rightMillimeters: [0, 0, 1],
    upMillimeters: [0, 1, 0],
    halfHeightMillimeters: 1.5 * scale[1]!,
    widthPixels: 9,
    heightPixels: 3,
    bands: [-scale[0]!, 0, scale[0]!].map((offset, index) => ({
      centerMillimeters: [center[0] + offset, center[1], center[2]],
      halfWidthMillimeters: 1.5 * scale[2]!,
      columnOffset: index * 3,
      columnCount: 3
    }))
  };
}
