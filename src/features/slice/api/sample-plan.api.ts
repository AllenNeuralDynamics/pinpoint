import type {
  AnnotationLevel,
  AnnotationVolume
} from "../models/annotation-level.model";
import type { SampleGeometry } from "../models/sample-geometry.model";
import type { SamplePlan } from "../models/sample-plan.model";

/** Preferred ceiling on chunk fetches per sample; not a guarantee. */
const PREFERRED_MAXIMUM_CHUNK_REQUESTS = 24;

/** How much coarser than one sample a level's voxel may be before it's too blurry to prefer. */
const RESOLUTION_TOLERANCE = 1.5;

/** Fraction of a level's smallest chunk extent the level-selection walk steps by. */
const COUNT_STEP_CHUNK_FRACTION = 0.5;

/** Starting per-chunk capacity of a bucket's sample arrays, doubled as needed. */
const INITIAL_BUCKET_CAPACITY = 1024;

/** One chunk's samples, accumulated into growable typed arrays. */
interface SampleBucket {
  chunkCoordinates: [number, number, number];
  count: number;
  sampleIndices: Int32Array<ArrayBuffer>;
  voxelOffsets: Int32Array<ArrayBuffer>;
}

/**
 * Bucket a geometry's samples by the annotation chunk each one reads from.
 * Walks the mm-to-voxel affine map incrementally (no per-sample division)
 * and caches the last resolved chunk's voxel-space origin so consecutive
 * samples inside the same chunk skip both the chunk divisions and a map
 * lookup.
 * @param geometry Geometry to sample.
 * @param level Multiscale level to sample from.
 * @param levelIndex Index of `level` within its volume.
 */
export function planSamples(
  geometry: SampleGeometry,
  level: AnnotationLevel,
  levelIndex: number
): SamplePlan {
  const [translationA, translationS, translationR] =
    level.translationMillimeters;
  const [scaleA, scaleS, scaleR] = level.scaleMillimeters;
  const [shapeA, shapeS, shapeR] = level.shapeVoxels;
  const [chunkA, chunkS, chunkR] = level.chunkShapeVoxels;
  const gridDv = Math.ceil(shapeS / chunkS);
  const gridMl = Math.ceil(shapeR / chunkR);

  const {
    rightMillimeters: right,
    upMillimeters: up,
    halfHeightMillimeters: halfHeight,
    widthPixels,
    heightPixels,
    bands
  } = geometry;
  const stepV = (2 * halfHeight) / heightPixels;
  const firstV = halfHeight - 0.5 * stepV;
  const rowA = (-up[0] * stepV) / scaleA;
  const rowS = (-up[1] * stepV) / scaleS;
  const rowR = (-up[2] * stepV) / scaleR;

  const buckets = new Map<number, SampleBucket>();
  let bucket: SampleBucket | null = null;
  let originA = -1;
  let originS = -1;
  let originR = -1;

  for (const band of bands) {
    const {
      centerMillimeters: center,
      halfWidthMillimeters: halfWidth,
      columnOffset,
      columnCount
    } = band;
    const stepU = (2 * halfWidth) / columnCount;
    const firstU = -halfWidth + 0.5 * stepU;

    const baseA =
      (center[0] + right[0] * firstU + up[0] * firstV - translationA) / scaleA;
    const baseS =
      (center[1] + right[1] * firstU + up[1] * firstV - translationS) / scaleS;
    const baseR =
      (center[2] + right[2] * firstU + up[2] * firstV - translationR) / scaleR;
    const columnA = (right[0] * stepU) / scaleA;
    const columnS = (right[1] * stepU) / scaleS;
    const columnR = (right[2] * stepU) / scaleR;

    for (let row = 0; row < heightPixels; row++) {
      // Each row restarts from a multiply so accumulated float error stays
      // bounded by one row rather than growing across the whole rectangle.
      let coordinateA = baseA + row * rowA;
      let coordinateS = baseS + row * rowS;
      let coordinateR = baseR + row * rowR;
      const rowOffset = row * widthPixels + columnOffset;

      for (
        let column = 0;
        column < columnCount;
        column++,
          coordinateA += columnA,
          coordinateS += columnS,
          coordinateR += columnR
      ) {
        // Math.floor, not `| 0`: `| 0` truncates toward zero and is wrong for
        // negative coordinates just outside the volume.
        const voxelA = Math.floor(coordinateA);
        const voxelS = Math.floor(coordinateS);
        const voxelR = Math.floor(coordinateR);
        if (
          voxelA < 0 ||
          voxelS < 0 ||
          voxelR < 0 ||
          voxelA >= shapeA ||
          voxelS >= shapeS ||
          voxelR >= shapeR
        ) {
          continue;
        }

        if (
          bucket === null ||
          voxelA < originA ||
          voxelA >= originA + chunkA ||
          voxelS < originS ||
          voxelS >= originS + chunkS ||
          voxelR < originR ||
          voxelR >= originR + chunkR
        ) {
          const chunkCoordinateA = Math.floor(voxelA / chunkA);
          const chunkCoordinateS = Math.floor(voxelS / chunkS);
          const chunkCoordinateR = Math.floor(voxelR / chunkR);
          originA = chunkCoordinateA * chunkA;
          originS = chunkCoordinateS * chunkS;
          originR = chunkCoordinateR * chunkR;

          const chunkKey =
            (chunkCoordinateA * gridDv + chunkCoordinateS) * gridMl +
            chunkCoordinateR;
          bucket = buckets.get(chunkKey) ?? null;
          if (!bucket) {
            bucket = {
              chunkCoordinates: [
                chunkCoordinateA,
                chunkCoordinateS,
                chunkCoordinateR
              ],
              count: 0,
              sampleIndices: new Int32Array(INITIAL_BUCKET_CAPACITY),
              voxelOffsets: new Int32Array(INITIAL_BUCKET_CAPACITY)
            };
            buckets.set(chunkKey, bucket);
          }
        }

        if (bucket.count === bucket.sampleIndices.length) growBucket(bucket);
        bucket.sampleIndices[bucket.count] = rowOffset + column;
        bucket.voxelOffsets[bucket.count] =
          ((voxelA - originA) * chunkS + (voxelS - originS)) * chunkR +
          (voxelR - originR);
        bucket.count += 1;
      }
    }
  }

  return {
    levelIndex,
    chunkRequests: Array.from(buckets.values(), bucket => ({
      chunkCoordinates: bucket.chunkCoordinates,
      sampleIndices: bucket.sampleIndices.subarray(0, bucket.count),
      voxelOffsets: bucket.voxelOffsets.subarray(0, bucket.count)
    }))
  };
}

/**
 * Double a bucket's sample arrays' capacity in place, preserving its content.
 * @param bucket Bucket to grow.
 */
function growBucket(bucket: SampleBucket): void {
  const sampleIndices = new Int32Array(bucket.sampleIndices.length * 2);
  sampleIndices.set(bucket.sampleIndices);
  bucket.sampleIndices = sampleIndices;

  const voxelOffsets = new Int32Array(bucket.voxelOffsets.length * 2);
  voxelOffsets.set(bucket.voxelOffsets);
  bucket.voxelOffsets = voxelOffsets;
}

/**
 * Select the finest level that resolves a geometry within the preferred
 * chunk budget and plan its samples, escalating to coarser levels and
 * falling back to the coarsest available when every level exceeds it.
 * @param geometry Geometry to sample.
 * @param volume Annotation volume to choose a level from and sample.
 */
export function selectSamplePlan(
  geometry: SampleGeometry,
  volume: AnnotationVolume
): SamplePlan {
  if (volume.levels.length === 0) return { levelIndex: 0, chunkRequests: [] };

  const millimetersPerSample = getMillimetersPerSample(geometry);
  let startIndex = 0;
  for (let index = 0; index < volume.levels.length; index++) {
    if (
      Math.min(...volume.levels[index]!.scaleMillimeters) <=
      RESOLUTION_TOLERANCE * millimetersPerSample
    ) {
      startIndex = index;
    }
  }

  for (let index = startIndex; index < volume.levels.length - 1; index++) {
    if (
      countChunksAtLevel(geometry, volume.levels[index]!) <=
      PREFERRED_MAXIMUM_CHUNK_REQUESTS
    ) {
      return planSamples(geometry, volume.levels[index]!, index);
    }
  }

  const coarsestIndex = volume.levels.length - 1;
  return planSamples(geometry, volume.levels[coarsestIndex]!, coarsestIndex);
}

/**
 * Approximate number of distinct chunks a geometry would read from a level,
 * via a coarse grid rather than a full per-sample walk - cheap enough to
 * probe every candidate level's chunk budget before committing to one.
 * @param geometry Geometry to sample.
 * @param level Multiscale level to probe.
 */
function countChunksAtLevel(
  geometry: SampleGeometry,
  level: AnnotationLevel
): number {
  const [translationA, translationS, translationR] =
    level.translationMillimeters;
  const [scaleA, scaleS, scaleR] = level.scaleMillimeters;
  const [shapeA, shapeS, shapeR] = level.shapeVoxels;
  const [chunkA, chunkS, chunkR] = level.chunkShapeVoxels;

  const {
    rightMillimeters: right,
    upMillimeters: up,
    halfHeightMillimeters: halfHeight,
    heightPixels,
    bands
  } = geometry;

  const stepMillimeters =
    COUNT_STEP_CHUNK_FRACTION *
    Math.min(chunkA * scaleA, chunkS * scaleS, chunkR * scaleR);
  const rows = Math.max(
    2,
    Math.min(heightPixels, Math.ceil((2 * halfHeight) / stepMillimeters) + 1)
  );

  const gridDv = Math.ceil(shapeS / chunkS);
  const gridMl = Math.ceil(shapeR / chunkR);
  const chunkKeys = new Set<number>();
  for (const band of bands) {
    const { centerMillimeters: center, halfWidthMillimeters: halfWidth } = band;
    const columns = Math.max(
      2,
      Math.min(
        band.columnCount,
        Math.ceil((2 * halfWidth) / stepMillimeters) + 1
      )
    );

    for (let row = 0; row < rows; row++) {
      const v = halfHeight - (2 * halfHeight * row) / (rows - 1);
      for (let column = 0; column < columns; column++) {
        const u = -halfWidth + (2 * halfWidth * column) / (columns - 1);

        const voxelA = Math.floor(
          (center[0] + right[0] * u + up[0] * v - translationA) / scaleA
        );
        const voxelS = Math.floor(
          (center[1] + right[1] * u + up[1] * v - translationS) / scaleS
        );
        const voxelR = Math.floor(
          (center[2] + right[2] * u + up[2] * v - translationR) / scaleR
        );
        if (
          voxelA < 0 ||
          voxelS < 0 ||
          voxelR < 0 ||
          voxelA >= shapeA ||
          voxelS >= shapeS ||
          voxelR >= shapeR
        ) {
          continue;
        }

        const chunkCoordinateA = Math.floor(voxelA / chunkA);
        const chunkCoordinateS = Math.floor(voxelS / chunkS);
        const chunkCoordinateR = Math.floor(voxelR / chunkR);
        chunkKeys.add(
          (chunkCoordinateA * gridDv + chunkCoordinateS) * gridMl +
            chunkCoordinateR
        );
      }
    }
  }

  return chunkKeys.size;
}

/**
 * Millimeters spanned by one sample of a geometry, along its finer axis.
 * @param geometry Geometry to measure.
 */
function getMillimetersPerSample(geometry: SampleGeometry): number {
  let finest = (2 * geometry.halfHeightMillimeters) / geometry.heightPixels;
  for (const band of geometry.bands) {
    const stepU = (2 * band.halfWidthMillimeters) / band.columnCount;
    if (stepU < finest) finest = stepU;
  }
  return finest;
}
