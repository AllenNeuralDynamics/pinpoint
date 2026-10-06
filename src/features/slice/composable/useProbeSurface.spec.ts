import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed } from "vue";
import type { Array as ZarrArray, DataType, Readable } from "zarrita";
import { makeProbe } from "@/test/fixtures";
import { planSamples } from "../api/sample-plan.api";
import type { AnnotationLevel } from "../models/annotation-level.model";
import type { SampleGeometry } from "../models/sample-geometry.model";
import { useAnnotationSampler } from "./useAnnotationSampler";
import { useProbeSurface } from "./useProbeSurface";

vi.mock("./useAnnotationSampler", () => ({ useAnnotationSampler: vi.fn() }));

const LEVEL: AnnotationLevel = {
  path: "s0",
  array: {} as ZarrArray<DataType, Readable>,
  shapeVoxels: [200, 200, 200],
  chunkShapeVoxels: [200, 200, 200],
  scaleMillimeters: [0.1, 0.1, 0.1],
  translationMillimeters: [0, 0, 0]
};

/**
 * Read a synthetic brain slab from DV 4 to 14 mm using the real voxel sampling plan.
 * @param geometry Sampling geometry constructed by the surface marcher.
 */
async function sampleSlab(geometry: SampleGeometry): Promise<Uint32Array> {
  const result = new Uint32Array(geometry.widthPixels * geometry.heightPixels);
  for (const request of planSamples(geometry, LEVEL, 0).chunkRequests) {
    request.sampleIndices.forEach((outputIndex, index) => {
      const dvIndex = Math.floor(request.voxelOffsets[index]! / 200) % 200;
      result[outputIndex] = dvIndex >= 40 && dvIndex < 140 ? 1 : 0;
    });
  }
  return result;
}

beforeEach(() => {
  vi.mocked(useAnnotationSampler).mockReturnValue({
    createStream: vi.fn(),
    structureIndex: computed(() => new Map()),
    getFinestLevel: async () => LEVEL,
    sampleOnce: sampleSlab
  });
});

describe("surface sampling in the native atlas frame", () => {
  it.each([0, Math.PI / 12])(
    "finds the entry along the actual probe axis with %s radians of root pitch",
    async rootPitch => {
      const { findTargets, isOnSurface } = useProbeSurface();
      const probe = makeProbe({
        tipPosition: [
          10 + 6 * Math.sin(rootPitch),
          6 * Math.cos(rootPitch),
          10
        ],
        rotation: [0, 0, Math.PI / 2 + rootPitch]
      });
      const result = await findTargets(probe);
      expect(result?.insideMillimeters).not.toBeNull();
      const [ap, dv, ml] = result!.insideMillimeters!;
      expect(dv).toBeCloseTo(4.05, 1);
      expect(ml).toBeCloseTo(10, 5);
      expect(
        (ap - 10) * Math.cos(rootPitch) - dv * Math.sin(rootPitch)
      ).toBeCloseTo(0, 5);
      expect(await isOnSurface(result!.insideMillimeters!)).toBe(true);
      expect(await isOnSurface(probe.tipPosition)).toBe(false);
      expect(result!.axisMillimeters).toBeNull();
      expect(result!.dorsoventralMillimeters).toBeNull();
    }
  );
});
