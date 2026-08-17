import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Array as ZarrArray, DataType, Readable } from "zarrita";
import { makeProbe } from "@/test/fixtures";
import { getTerminologyRows } from "@/features/atlas";
import type { Probe } from "@/features/probe";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import type { AxisDirections } from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  convertCoordinate
} from "@/utils/coordinate-frame";
import type { AnnotationLevel } from "../models/annotation-level.model";
import type { SampleGeometry } from "../models/sample-geometry.model";
import { useProbeSurface } from "./useProbeSurface";

// Creating the experiment store kicks off manifest/terminology fetches, so the
// leaf source module is mocked to keep the suite off the network.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@/features/atlas/api/source.api"
  );
  return { ...actual, getTerminologyRows: vi.fn() };
});

/** Level every ray is marched through: a single 0.4 x 0.6 x 0.4 mm chunk at the origin. */
const LEVEL: AnnotationLevel = {
  path: "s0",
  array: {} as unknown as ZarrArray<DataType, Readable>,
  shapeVoxels: [4, 6, 4],
  chunkShapeVoxels: [4, 6, 4],
  scaleMillimeters: [0.1, 0.1, 0.1],
  translationMillimeters: [0, 0, 0]
};

/**
 * Atlas point the probes sit at, mid-volume in {@link LEVEL} so every ray clips
 * into it and reaches the sampler.
 */
const ATLAS_TIP: [number, number, number] = [0.15, 0.25, 0.15];

/** Geometries the composable handed the shared sampler, in call order. */
let sampledGeometries: SampleGeometry[] = [];

const sampleOnce = vi.fn(async (geometry: SampleGeometry) => {
  sampledGeometries.push(geometry);
  return null;
});
const getFinestLevel = vi.fn(async () => LEVEL as AnnotationLevel | null);

vi.mock("./useAnnotationSampler", () => ({
  useAnnotationSampler: () => ({ getFinestLevel, sampleOnce })
}));

describe("useProbeSurface", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
    sampledGeometries = [];
    sampleOnce.mockClear();
    getFinestLevel.mockClear();
    getFinestLevel.mockResolvedValue(LEVEL);
    setActivePinia(createPinia());
  });

  it("marches the probe's shank away from the tip using the experiment's rest orientation", async () => {
    const store = useCurrentExperimentStore();
    const { findTargets } = useProbeSurface();

    await findTargets(makeCenteredProbe(store.axisDirections));

    // The default rest points depth posterior, so the shank runs anterior,
    // which the atlas's own frame calls -AP.
    expectTriple(sampledGeometries[0]!.upMillimeters, [-1, 0, 0]);
  });

  it("re-aims the rays when the experiment's local coordinate system changes", async () => {
    const store = useCurrentExperimentStore();
    store.setLocalCoordinateSystem({
      depthDirection: "Posterior_to_anterior",
      forwardDirection: "Inferior_to_superior"
    });
    const { findTargets } = useProbeSurface();

    await findTargets(makeCenteredProbe(store.axisDirections));

    // Depth now points anterior, so the shank runs posterior, i.e. atlas +AP.
    expectTriple(sampledGeometries[0]!.upMillimeters, [1, 0, 0]);
  });

  it("converts a global-system point into atlas millimeters before testing the surface", async () => {
    const store = useCurrentExperimentStore();
    const { isOnSurface } = useProbeSurface();

    await isOnSurface(
      convertCoordinate(ATLAS_AXIS_DIRECTIONS, store.axisDirections, ATLAS_TIP)
    );

    // The neighborhood is centered on the voxel the converted point falls in.
    expect(sampledGeometries).toHaveLength(1);
    expectTriple(sampledGeometries[0]!.bands[1]!.centerMillimeters, ATLAS_TIP);
  });

  it("resolves null without sampling when no annotation level opens", async () => {
    getFinestLevel.mockResolvedValue(null);
    const { findTargets, isOnSurface } = useProbeSurface();

    expect(await findTargets(makeProbe())).toBeNull();
    expect(await isOnSurface([0, 0, 0])).toBeNull();
    expect(sampleOnce).not.toHaveBeenCalled();
  });
});

/**
 * Probe resting at {@link ATLAS_TIP}, expressed in the experiment's own global
 * coordinate system.
 * @param directions Axis directions the experiment reports coordinates in.
 */
function makeCenteredProbe(directions: AxisDirections): Probe {
  return makeProbe({
    tipPosition: convertCoordinate(
      ATLAS_AXIS_DIRECTIONS,
      directions,
      ATLAS_TIP
    ),
    rotation: [0, 0, 0]
  });
}

/**
 * Assert a triple matches an expected triple within float tolerance.
 * @param actual Triple to check.
 * @param expected Triple to check against.
 */
function expectTriple(
  actual: [number, number, number],
  expected: [number, number, number]
): void {
  for (const [index, value] of expected.entries()) {
    expect(actual[index]).toBeCloseTo(value, 9);
  }
}
