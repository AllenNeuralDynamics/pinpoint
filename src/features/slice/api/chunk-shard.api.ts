import type {
  SampleChunkRequest,
  SamplePlan
} from "../models/sample-plan.model";

/** Lower bound on worker count, so the pool always has somewhere to send work. */
const MINIMUM_WORKER_COUNT = 1;

/** Upper bound on worker count - the marginal decode gain past this is small
 * next to memory cost, and the network binds well before the CPU does. */
const MAXIMUM_WORKER_COUNT = 4;

/** Cores devoted per sampler worker, when sizing the pool from `hardwareConcurrency`. */
const CORES_PER_WORKER = 4;

/** Fallback core count when `hardwareConcurrency` is unavailable. */
const FALLBACK_HARDWARE_CONCURRENCY = 4;

/**
 * Number of sampler workers to run, from the machine's core count.
 * @param hardwareConcurrency Reported core count, e.g. `navigator.hardwareConcurrency`.
 */
export function getWorkerCount(hardwareConcurrency: number): number {
  const cores = hardwareConcurrency || FALLBACK_HARDWARE_CONCURRENCY;
  return Math.min(
    MAXIMUM_WORKER_COUNT,
    Math.max(MINIMUM_WORKER_COUNT, Math.floor(cores / CORES_PER_WORKER))
  );
}

/**
 * Owning worker index for a chunk, from a bit-mixed hash of its coordinates.
 *
 * The mix matters: spatially adjacent chunks have numerically adjacent keys,
 * so a bare modulo would assign whole slabs of one plane to one worker.
 * @param chunkCoordinates Chunk grid coordinates as [ap, dv, ml].
 * @param workerCount Number of workers in the pool.
 */
function getChunkShard(
  chunkCoordinates: [number, number, number],
  workerCount: number
): number {
  if (workerCount <= 1) return 0;

  const [a, s, r] = chunkCoordinates;
  const folded = (a * 73856093) ^ (s * 19349663) ^ (r * 83492791);
  return mixBits(folded) % workerCount;
}

/**
 * Split a plan's chunk requests into one group per owning worker.
 * @param plan Plan to split.
 * @param workerCount Number of workers in the pool.
 */
export function groupRequestsByShard(
  plan: SamplePlan,
  workerCount: number
): SampleChunkRequest[][] {
  const groups: SampleChunkRequest[][] = Array.from(
    { length: workerCount },
    () => []
  );
  for (const request of plan.chunkRequests) {
    groups[getChunkShard(request.chunkCoordinates, workerCount)]!.push(request);
  }
  return groups;
}

/**
 * Integer hash bit mix (Murmur3-style finalizer), used to spread spatially
 * adjacent keys evenly across shards before the modulo.
 * @param value Value to mix.
 */
function mixBits(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}
