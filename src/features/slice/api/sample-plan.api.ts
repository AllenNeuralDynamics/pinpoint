import type {
  AnnotationLevel,
  AnnotationVolume
} from "../models/annotation-level.model";
import type { SampleGeometry } from "../models/sample-geometry.model";
import type {
  SampleChunkRequest,
  SamplePlan
} from "../models/sample-plan.model";

/** Preferred ceiling on chunk fetches per sample; not a guarantee. */
const PREFERRED_MAXIMUM_CHUNK_REQUESTS = 24;

/** How much coarser than one sample a level's voxel may be before it's too blurry to prefer. */
const RESOLUTION_TOLERANCE = 1.5;

/** A chunk grid's dorsoventral and mediolateral chunk counts, for packing chunk coordinates into a single key. */
interface ChunkGrid {
  gridDv: number;
  gridMl: number;
}

/** A sample's resolved chunk and its offset within that chunk. */
interface ResolvedVoxel {
  chunkCoordinates: [number, number, number];
  chunkKey: number;
  voxelOffset: number;
}

/**
 * Bucket a geometry's samples by the annotation chunk each one reads from.
 * @param geometry Geometry to sample.
 * @param level Multiscale level to sample from.
 * @param levelIndex Index of `level` within its volume.
 */
export function planSamples(
  geometry: SampleGeometry,
  level: AnnotationLevel,
  levelIndex: number
): SamplePlan {
  const grid = getChunkGrid(level);
  const buckets = new Map<
    number,
    {
      chunkCoordinates: [number, number, number];
      sampleIndices: number[];
      voxelOffsets: number[];
    }
  >();

  forEachSamplePoint(geometry, (index, a, s, r) => {
    const voxel = resolveVoxel(level, grid, a, s, r);
    if (!voxel) return;

    let bucket = buckets.get(voxel.chunkKey);
    if (!bucket) {
      bucket = {
        chunkCoordinates: voxel.chunkCoordinates,
        sampleIndices: [],
        voxelOffsets: []
      };
      buckets.set(voxel.chunkKey, bucket);
    }
    bucket.sampleIndices.push(index);
    bucket.voxelOffsets.push(voxel.voxelOffset);
  });

  const chunkRequests: SampleChunkRequest[] = Array.from(
    buckets.values(),
    bucket => ({
      chunkCoordinates: bucket.chunkCoordinates,
      sampleIndices: Int32Array.from(bucket.sampleIndices),
      voxelOffsets: Int32Array.from(bucket.voxelOffsets)
    })
  );

  return { levelIndex, sampleCount: getSampleCount(geometry), chunkRequests };
}

/**
 * Number of distinct chunks a geometry would read from.
 * @param geometry Geometry to sample.
 * @param level Multiscale level to sample from.
 */
export function countSampleChunks(
  geometry: SampleGeometry,
  level: AnnotationLevel
): number {
  const grid = getChunkGrid(level);
  const chunkKeys = new Set<number>();

  forEachSamplePoint(geometry, (_index, a, s, r) => {
    const voxel = resolveVoxel(level, grid, a, s, r);
    if (voxel) chunkKeys.add(voxel.chunkKey);
  });

  return chunkKeys.size;
}

/**
 * Index of the finest level that resolves the geometry within the preferred
 * chunk budget, escalating to coarser levels and falling back to the
 * coarsest available when every level exceeds it.
 * @param volume Annotation volume to choose a level from.
 * @param geometry Geometry to sample.
 */
export function selectAnnotationLevelIndex(
  volume: AnnotationVolume,
  geometry: SampleGeometry
): number {
  if (volume.levels.length === 0) return 0;

  const millimetersPerSample = getMillimetersPerSample(geometry);
  let startIndex = 0;
  for (let index = 0; index < volume.levels.length; index++) {
    const level = volume.levels[index]!;
    if (
      Math.min(...level.scaleMillimeters) <=
      RESOLUTION_TOLERANCE * millimetersPerSample
    ) {
      startIndex = index;
    }
  }

  for (let index = startIndex; index < volume.levels.length; index++) {
    const isCoarsestLevel = index === volume.levels.length - 1;
    if (
      isCoarsestLevel ||
      countSampleChunks(geometry, volume.levels[index]!) <=
        PREFERRED_MAXIMUM_CHUNK_REQUESTS
    ) {
      return index;
    }
  }

  return volume.levels.length - 1;
}

/**
 * Millimeters spanned by one sample of a geometry.
 * @param geometry Geometry to measure.
 */
function getMillimetersPerSample(geometry: SampleGeometry): number {
  return geometry.kind === "plane"
    ? (2 * geometry.halfExtentMillimeters) / geometry.sizePixels
    : geometry.lengthMillimeters / geometry.sampleCount;
}

/**
 * Total number of samples a geometry produces.
 * @param geometry Geometry to measure.
 */
function getSampleCount(geometry: SampleGeometry): number {
  return geometry.kind === "plane"
    ? geometry.sizePixels * geometry.sizePixels
    : geometry.sampleCount;
}

/**
 * Visit every sample point of a geometry in atlas ASR millimeters.
 *
 * For a plane, row 0 is the +up edge and samples are visited row-major - the
 * same convention the slice canvas's SVG overlay must mirror.
 * @param geometry Geometry to walk.
 * @param visit Callback invoked with each sample's output index and ASR coordinates.
 */
function forEachSamplePoint(
  geometry: SampleGeometry,
  visit: (index: number, a: number, s: number, r: number) => void
): void {
  if (geometry.kind === "plane") {
    const {
      centerMillimeters,
      rightMillimeters,
      upMillimeters,
      halfExtentMillimeters,
      sizePixels
    } = geometry;
    const step = (2 * halfExtentMillimeters) / sizePixels;

    for (let row = 0; row < sizePixels; row++) {
      const v = halfExtentMillimeters - (row + 0.5) * step;
      for (let column = 0; column < sizePixels; column++) {
        const u = -halfExtentMillimeters + (column + 0.5) * step;
        visit(
          row * sizePixels + column,
          centerMillimeters[0] + rightMillimeters[0] * u + upMillimeters[0] * v,
          centerMillimeters[1] + rightMillimeters[1] * u + upMillimeters[1] * v,
          centerMillimeters[2] + rightMillimeters[2] * u + upMillimeters[2] * v
        );
      }
    }
    return;
  }

  const {
    originMillimeters,
    directionMillimeters,
    lengthMillimeters,
    sampleCount
  } = geometry;
  for (let index = 0; index < sampleCount; index++) {
    const t = ((index + 0.5) / sampleCount) * lengthMillimeters;
    visit(
      index,
      originMillimeters[0] + directionMillimeters[0] * t,
      originMillimeters[1] + directionMillimeters[1] * t,
      originMillimeters[2] + directionMillimeters[2] * t
    );
  }
}

/**
 * Chunk grid dimensions of a level, for packing chunk coordinates into a
 * single lookup key.
 * @param level Level to derive the grid from.
 */
function getChunkGrid(level: AnnotationLevel): ChunkGrid {
  const [, dvShape, mlShape] = level.shapeVoxels;
  const [, dvChunk, mlChunk] = level.chunkShapeVoxels;
  return {
    gridDv: Math.ceil(dvShape / dvChunk),
    gridMl: Math.ceil(mlShape / mlChunk)
  };
}

/**
 * Resolve an ASR millimeter point to its chunk and voxel offset within that
 * chunk, or null when the point falls outside the level's volume.
 * @param level Level to resolve against.
 * @param grid Level's chunk grid dimensions.
 * @param a Anterior-posterior coordinate, in mm.
 * @param s Superior-inferior coordinate, in mm.
 * @param r Right-left coordinate, in mm.
 */
function resolveVoxel(
  level: AnnotationLevel,
  grid: ChunkGrid,
  a: number,
  s: number,
  r: number
): ResolvedVoxel | null {
  const [translationA, translationS, translationR] =
    level.translationMillimeters;
  const [scaleA, scaleS, scaleR] = level.scaleMillimeters;
  const [shapeA, shapeS, shapeR] = level.shapeVoxels;
  const [chunkA, chunkS, chunkR] = level.chunkShapeVoxels;

  // Math.floor, not `| 0`: `| 0` truncates toward zero and is wrong for
  // negative coordinates just outside the volume.
  const voxelA = Math.floor((a - translationA) / scaleA);
  const voxelS = Math.floor((s - translationS) / scaleS);
  const voxelR = Math.floor((r - translationR) / scaleR);
  if (
    voxelA < 0 ||
    voxelS < 0 ||
    voxelR < 0 ||
    voxelA >= shapeA ||
    voxelS >= shapeS ||
    voxelR >= shapeR
  ) {
    return null;
  }

  const chunkCoordinateA = Math.floor(voxelA / chunkA);
  const chunkCoordinateS = Math.floor(voxelS / chunkS);
  const chunkCoordinateR = Math.floor(voxelR / chunkR);
  const chunkKey =
    (chunkCoordinateA * grid.gridDv + chunkCoordinateS) * grid.gridMl +
    chunkCoordinateR;
  const voxelOffset =
    ((voxelA - chunkCoordinateA * chunkA) * chunkS +
      (voxelS - chunkCoordinateS * chunkS)) *
      chunkR +
    (voxelR - chunkCoordinateR * chunkR);

  return {
    chunkCoordinates: [chunkCoordinateA, chunkCoordinateS, chunkCoordinateR],
    chunkKey,
    voxelOffset
  };
}
