import { describe, expect, it, vi } from "vitest";
import {
  buildExperimentArchive,
  restoreExperimentArchive
} from "./experiment-archive.api";
import {
  buildCoordinateAxis,
  buildDefaultGlobalCoordinateSystem
} from "@/utils/coordinate-frame";
import {
  makeExperiment,
  makeProbe,
  makeProbeInterfaceProbe,
  makeSceneObject
} from "@/test/fixtures";
import { internProbeInterfaceProbe } from "@/features/experiment";

// `getSceneModel`/`putSceneModel` go through `idb-keyval`, which needs a real
// IndexedDB the test environment doesn't provide. Replace it with an in-memory
// map, matching `useExperimentFile.spec.ts`.
const sceneModelMemoryStore = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  createStore: () => "fake-store",
  get: async (key: string) => sceneModelMemoryStore.get(key),
  set: async (key: string, value: unknown) => {
    sceneModelMemoryStore.set(key, value);
  }
}));

/**
 * Build an experiment saved in an atlas-aligned coordinate system, with one
 * probe and one scene object placed in it.
 */
function makeRotatedExperiment() {
  const experiment = makeExperiment({
    name: "Rotated",
    globalCoordinateSystem: {
      ...buildDefaultGlobalCoordinateSystem(),
      axes: [
        buildCoordinateAxis("Anterior_to_posterior"),
        buildCoordinateAxis("Superior_to_inferior"),
        buildCoordinateAxis("Right_to_left")
      ],
      rotationDisplayOrder: [1, 2, 0]
    },
    localCoordinateSystem: {
      depthDirection: "Superior_to_inferior",
      forwardDirection: "Posterior_to_anterior"
    },
    referenceCoordinate: [5.4, 0.33, 5.7]
  });
  internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
  experiment.probes = [
    makeProbe({ tipPosition: [1, 2, 3], rotation: [0.1, 0.2, 0.3] })
  ];
  experiment.sceneObjects = [
    makeSceneObject({ position: [4, 5, 6], scale: [1, 2, 3] })
  ];
  return experiment;
}

describe("buildExperimentArchive / restoreExperimentArchive", () => {
  it("keeps the experiment's coordinate systems across a sync round trip", async () => {
    const experiment = makeRotatedExperiment();

    const restored = await restoreExperimentArchive(
      await buildExperimentArchive(experiment)
    );

    expect(restored?.experiment.globalCoordinateSystem).toEqual(
      experiment.globalCoordinateSystem
    );
    expect(restored?.experiment.localCoordinateSystem).toEqual(
      experiment.localCoordinateSystem
    );
  });

  it("keeps every stored coordinate byte-identical across a sync round trip", async () => {
    const experiment = makeRotatedExperiment();

    const restored = await restoreExperimentArchive(
      await buildExperimentArchive(experiment)
    );

    expect(restored?.experiment).toEqual(experiment);
  });

  it("returns null for an archive whose experiment has no coordinate systems", async () => {
    const experiment = makeRotatedExperiment();
    const archive = await buildExperimentArchive({
      ...experiment,
      globalCoordinateSystem:
        undefined as unknown as typeof experiment.globalCoordinateSystem
    });

    expect(await restoreExperimentArchive(archive)).toBeNull();
  });
});
