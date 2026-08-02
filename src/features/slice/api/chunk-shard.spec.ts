import { describe, expect, it } from "vitest";
import type {
  SampleChunkRequest,
  SamplePlan
} from "../models/sample-plan.model";
import { getWorkerCount, groupRequestsByShard } from "./chunk-shard.api";

function makeRequest(
  chunkCoordinates: [number, number, number]
): SampleChunkRequest {
  return {
    chunkCoordinates,
    sampleIndices: new Int32Array(),
    voxelOffsets: new Int32Array()
  };
}

describe("getWorkerCount", () => {
  it("scales with core count, one worker per 4 cores", () => {
    expect(getWorkerCount(4)).toBe(1);
    expect(getWorkerCount(8)).toBe(2);
    expect(getWorkerCount(16)).toBe(4);
  });

  it("caps at 4 workers even with many cores", () => {
    expect(getWorkerCount(32)).toBe(4);
  });

  it("never returns fewer than 1 worker", () => {
    expect(getWorkerCount(1)).toBe(1);
  });

  it("falls back to a default core count when hardwareConcurrency is 0", () => {
    expect(getWorkerCount(0)).toBe(getWorkerCount(4));
  });
});

describe("groupRequestsByShard", () => {
  it("is deterministic - the same chunk maps to the same shard every time", () => {
    const plan: SamplePlan = {
      levelIndex: 0,
      sampleCount: 0,
      chunkRequests: [makeRequest([3, 7, 12])]
    };

    const first = groupRequestsByShard(plan, 4);
    const second = groupRequestsByShard(plan, 4);

    expect(first.findIndex(group => group.length > 0)).toBe(
      second.findIndex(group => group.length > 0)
    );
  });

  it("partitions every request into exactly one group, none lost or duplicated", () => {
    const plan: SamplePlan = {
      levelIndex: 0,
      sampleCount: 0,
      chunkRequests: [
        makeRequest([0, 0, 0]),
        makeRequest([1, 0, 0]),
        makeRequest([0, 1, 0]),
        makeRequest([5, 5, 5])
      ]
    };

    const groups = groupRequestsByShard(plan, 4);

    expect(groups).toHaveLength(4);
    const flattened = groups.flat();
    expect(flattened).toHaveLength(plan.chunkRequests.length);
    for (const request of plan.chunkRequests) {
      expect(flattened.filter(r => r === request)).toHaveLength(1);
    }
  });

  it("puts every request in shard 0 for a single worker", () => {
    const plan: SamplePlan = {
      levelIndex: 0,
      sampleCount: 0,
      chunkRequests: [makeRequest([0, 0, 0]), makeRequest([9, 9, 9])]
    };

    const groups = groupRequestsByShard(plan, 1);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("returns an empty group for a worker with no owned chunks", () => {
    const plan: SamplePlan = {
      levelIndex: 0,
      sampleCount: 0,
      chunkRequests: []
    };

    const groups = groupRequestsByShard(plan, 3);

    expect(groups).toEqual([[], [], []]);
  });

  it("spreads spatially adjacent chunks across shards rather than clumping", () => {
    // A realistic plane's chunk footprint: a contiguous block of chunk
    // coordinates. A bare modulo would put whole rows/columns on one shard.
    const workerCount = 4;
    const chunkRequests: SampleChunkRequest[] = [];
    for (let a = 0; a < 4; a++) {
      for (let s = 0; s < 4; s++) {
        for (let r = 0; r < 4; r++) {
          chunkRequests.push(makeRequest([a, s, r]));
        }
      }
    }
    const plan: SamplePlan = { levelIndex: 0, sampleCount: 0, chunkRequests };

    const groups = groupRequestsByShard(plan, workerCount);

    const ideal = chunkRequests.length / workerCount;
    for (const group of groups) {
      expect(group.length).toBeLessThanOrEqual(ideal * 1.5);
      expect(group.length).toBeGreaterThan(0);
    }
  });
});
