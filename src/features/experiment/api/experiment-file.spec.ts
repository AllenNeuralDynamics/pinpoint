import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  buildExperimentFileName,
  unzipExperiment,
  zipExperiment
} from "./experiment-file.api";
import {
  addCameraPose,
  addProbe,
  internCoordinateSystem,
  internProbeInterfaceProbe
} from "./experiment.api";
import { copyCameraPose } from "./camera-pose.api";
import { buildProbe, detachProbeInterfaceProbe } from "@/features/probe";
import {
  type AnatomicalDirection,
  buildCoordinateAxis
} from "@/utils/coordinate-frame";
import type { AxisOrder } from "@/utils/axis-order";
import {
  makeCameraPose,
  makeCoordinateSystem,
  makeExperiment,
  makeProbeInterfaceProbe,
  makeSceneModel,
  makeSceneObject
} from "@/test/fixtures";
import type { Experiment } from "../models/experiment.model";

/**
 * Build an experiment with one interned probe interface definition and one
 * probe referencing it, for round-trip and validation tests.
 */
function makeFullExperiment(): Experiment {
  const experiment = makeExperiment({
    name: "My Experiment",
    referenceCoordinate: [1, 2, 3]
  });
  const spec = makeProbeInterfaceProbe({
    annotations: { manufacturer: "imec", model_name: "np1" }
  });
  internProbeInterfaceProbe(experiment, spec);
  const coordinateSystem = makeCoordinateSystem();
  internCoordinateSystem(experiment, coordinateSystem);
  addProbe(
    experiment,
    buildProbe(
      spec,
      [0, 0, 0],
      experiment.globalCoordinateSystem,
      experiment.localCoordinateSystem
    )
  );
  experiment.visibleStructures = [{ id: 5, isTransparent: false }];
  return experiment;
}

/**
 * Build zip bytes carrying arbitrary experiment JSON under the fixed entry
 * name, bypassing `zipExperiment`'s typed `Experiment` parameter so malformed
 * shapes can exercise `unzipExperiment`'s validation.
 * @param data Value to serialize as the zip's `experiment.json` entry.
 */
function zipRawExperiment(data: unknown): Uint8Array {
  return zipSync({ "experiment.json": strToU8(JSON.stringify(data)) });
}

describe("zipExperiment / unzipExperiment", () => {
  it("round-trips an experiment and its scene object model files", () => {
    const experiment = makeFullExperiment();
    const sceneObject = makeSceneObject();
    experiment.sceneObjects = [sceneObject];
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const archive = unzipExperiment(
      zipExperiment(
        experiment,
        new Map([[sceneObject.modelId, { fileName: "model.obj", bytes }]])
      )
    );

    expect(archive?.experiment).toEqual(experiment);
    expect(archive?.models.get(sceneObject.modelId)).toEqual({
      fileName: "model.obj",
      bytes
    });
  });

  it("round-trips a probe's body model file under the models directory", () => {
    const experiment = makeFullExperiment();
    const bodyModel = makeSceneModel();
    experiment.probes[0] = { ...experiment.probes[0]!, bodyModel };
    const bytes = new Uint8Array([5, 6, 7]);

    const archive = unzipExperiment(
      zipExperiment(
        experiment,
        new Map([[bodyModel.modelId, { fileName: "body.glb", bytes }]])
      )
    );

    expect(archive?.experiment).toEqual(experiment);
    expect(archive?.models.get(bodyModel.modelId)).toEqual({
      fileName: "body.glb",
      bytes
    });
  });

  it("preserves an original file name unchanged through the zip round trip", () => {
    const experiment = makeFullExperiment();
    const sceneObject = makeSceneObject();
    experiment.sceneObjects = [sceneObject];
    const bytes = new Uint8Array([9, 8, 7]);

    const archive = unzipExperiment(
      zipExperiment(
        experiment,
        new Map([[sceneObject.modelId, { fileName: "imagingWell.obj", bytes }]])
      )
    );

    expect(archive?.models.get(sceneObject.modelId)?.fileName).toBe(
      "imagingWell.obj"
    );
  });

  it("does not leak markRaw's non-enumerable marker into the output", () => {
    const experiment = makeFullExperiment();
    const identifier = Object.keys(experiment.probeInterfaceProbes)[0]!;
    experiment.probeInterfaceProbes[identifier] = detachProbeInterfaceProbe(
      experiment.probeInterfaceProbes[identifier]!
    );

    const entries = unzipSync(zipExperiment(experiment, new Map()));
    expect(strFromU8(entries["experiment.json"]!)).not.toContain("__v_skip");
  });

  it("returns null for non-zip bytes", () => {
    expect(unzipExperiment(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("returns null when the zip has no experiment.json entry", () => {
    const zipBytes = zipSync({ "data.json": strToU8("{}") });
    expect(unzipExperiment(zipBytes)).toBeNull();
  });

  it("returns null when experiment.json fails validation", () => {
    expect(unzipExperiment(zipRawExperiment({}))).toBeNull();
  });

  it("parses and omits a model entry for a scene object the experiment does not reference", () => {
    const experiment = makeFullExperiment();
    const entries = {
      "experiment.json": strToU8(JSON.stringify(experiment)),
      "models/unreferenced-id/model.glb": new Uint8Array([9, 9, 9])
    };

    const archive = unzipExperiment(zipSync(entries));

    expect(archive?.experiment).toEqual(experiment);
    expect(archive?.models.size).toBe(0);
  });

  it("returns null when id is missing", () => {
    const { id: _id, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when version is missing", () => {
    const { version: _version, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when updatedAt is missing", () => {
    const { updatedAt: _updatedAt, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when updatedAt is not a parseable timestamp", () => {
    const experiment = { ...makeFullExperiment(), updatedAt: "not a date" };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when author is missing", () => {
    const { author: _author, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when author is missing its orcid", () => {
    const experiment = { ...makeFullExperiment(), author: { name: "Alice" } };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("round-trips an authored experiment", () => {
    const experiment = {
      ...makeFullExperiment(),
      author: { orcid: "0000-0001-2345-6789", name: "Alice" }
    };
    expect(unzipExperiment(zipRawExperiment(experiment))?.experiment).toEqual(
      experiment
    );
  });

  it("returns null when name is missing", () => {
    const { name: _name, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when name has the wrong type", () => {
    const experiment = { ...makeFullExperiment(), name: 5 };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when atlas is missing", () => {
    const { atlas: _atlas, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when atlas.source has the wrong type", () => {
    const experiment = makeFullExperiment();
    experiment.atlas = { ...experiment.atlas, source: 5 as unknown as string };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when atlas.manifest is missing", () => {
    const experiment = makeFullExperiment();
    const { manifest: _manifest, ...atlasWithoutManifest } = experiment.atlas;
    experiment.atlas = atlasWithoutManifest as Experiment["atlas"];
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when referenceCoordinate has the wrong length", () => {
    const experiment = {
      ...makeFullExperiment(),
      referenceCoordinate: [1, 2] as unknown as [number, number, number]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when referenceCoordinate contains a non-number", () => {
    const experiment = {
      ...makeFullExperiment(),
      referenceCoordinate: [1, 2, "3"] as unknown as [number, number, number]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when visibleStructures contains a non-number id", () => {
    const experiment = {
      ...makeFullExperiment(),
      visibleStructures: ["1"] as unknown as Experiment["visibleStructures"]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a visible structure is missing isTransparent", () => {
    const experiment = {
      ...makeFullExperiment(),
      visibleStructures: [
        { id: 1 }
      ] as unknown as Experiment["visibleStructures"]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a visible structure's id has the wrong type", () => {
    const experiment = {
      ...makeFullExperiment(),
      visibleStructures: [
        { id: "1", isTransparent: true }
      ] as unknown as Experiment["visibleStructures"]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when two visible structures share an id", () => {
    const experiment = {
      ...makeFullExperiment(),
      visibleStructures: [
        { id: 1, isTransparent: true },
        { id: 1, isTransparent: false }
      ]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when probeInterfaceProbes is an array", () => {
    const experiment = {
      ...makeFullExperiment(),
      probeInterfaceProbes: [] as unknown as Experiment["probeInterfaceProbes"]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a probe interface definition is missing annotations", () => {
    const experiment = makeFullExperiment();
    const identifier = Object.keys(experiment.probeInterfaceProbes)[0]!;
    const { annotations: _annotations, ...definition } =
      experiment.probeInterfaceProbes[identifier]!;
    experiment.probeInterfaceProbes[identifier] =
      definition as Experiment["probeInterfaceProbes"][string];

    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a probe interface definition's key does not match its derived identifier", () => {
    const experiment = makeFullExperiment();
    const identifier = Object.keys(experiment.probeInterfaceProbes)[0]!;
    const definition = experiment.probeInterfaceProbes[identifier]!;
    delete experiment.probeInterfaceProbes[identifier];
    // A mismatched key would make `syncProbes` (src/features/scene/api/probe.api.ts)
    // dispose and rebuild the probe's meshes on every sync pass.
    experiment.probeInterfaceProbes["wrong identifier"] = definition;

    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a probe's coordinateSystemIdentifier is absent from coordinateSystems", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = {
      ...experiment.probes[0]!,
      coordinateSystemIdentifier: "missing identifier"
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a coordinate system entry's key does not match its definition's id", () => {
    const experiment = makeFullExperiment();
    const identifier = Object.keys(experiment.coordinateSystems)[0]!;
    const coordinateSystem = experiment.coordinateSystems[identifier]!;
    experiment.coordinateSystems[identifier] = {
      ...coordinateSystem,
      id: "wrong identifier"
    };

    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when coordinateSystems is missing", () => {
    const { coordinateSystems: _coordinateSystems, ...rest } =
      makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("round-trips a probe with a null coordinateSystemIdentifier when coordinateSystems is empty", () => {
    const experiment = {
      ...makeFullExperiment(),
      coordinateSystems: {} as Experiment["coordinateSystems"]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))?.experiment).toEqual(
      experiment
    );
  });

  it("returns null when a coordinate system node's positionDisplayOrder is not a permutation", () => {
    const experiment = makeFullExperiment();
    const identifier = Object.keys(experiment.coordinateSystems)[0]!;
    const coordinateSystem = experiment.coordinateSystems[identifier]!;
    experiment.coordinateSystems[identifier] = {
      ...coordinateSystem,
      chain: [
        { ...coordinateSystem.chain[0]!, positionDisplayOrder: [0, 0, 1] }
      ]
    };

    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when probes is not an array", () => {
    const experiment = {
      ...makeFullExperiment(),
      probes: {} as unknown as Experiment["probes"]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a probe has an invalid inspectableKind", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = {
      ...experiment.probes[0]!,
      inspectableKind: "atlas" as "probe"
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a probe has an unknown visibility", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = {
      ...experiment.probes[0]!,
      visibility: "invisible" as Experiment["probes"][number]["visibility"]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a probe has an invalid color", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = { ...experiment.probes[0]!, color: "red" };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a probe has a short tipPosition", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = {
      ...experiment.probes[0]!,
      tipPosition: [0, 0] as unknown as [number, number, number]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a probe is missing slice-view fields, e.g. from an experiment saved before they existed", () => {
    const experiment = makeFullExperiment();
    const { sliceExtentMillimeters: _extent, ...probe } = experiment.probes[0]!;
    experiment.probes[0] = probe as Experiment["probes"][number];
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when two probes share an id", () => {
    const experiment = makeFullExperiment();
    const spec =
      experiment.probeInterfaceProbes[
        Object.keys(experiment.probeInterfaceProbes)[0]!
      ]!;
    const duplicate = {
      ...buildProbe(
        spec,
        [0, 0, 0],
        experiment.globalCoordinateSystem,
        experiment.localCoordinateSystem
      ),
      id: experiment.probes[0]!.id
    };
    experiment.probes.push(duplicate);

    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a probe's probeInterfaceIdentifier is dangling", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = {
      ...experiment.probes[0]!,
      probeInterfaceIdentifier: "missing identifier"
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when sceneObjects is missing", () => {
    const { sceneObjects: _sceneObjects, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when a scene object is malformed", () => {
    const experiment = makeFullExperiment();
    experiment.sceneObjects = [{ ...makeSceneObject(), color: "red" }];
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when two scene objects share an id", () => {
    const experiment = makeFullExperiment();
    const sceneObject = makeSceneObject();
    experiment.sceneObjects = [sceneObject, { ...sceneObject, name: "Other" }];
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("accepts two scene objects that share a modelId but have distinct ids", () => {
    const experiment = makeFullExperiment();
    const a = makeSceneObject();
    const b = makeSceneObject({ modelId: a.modelId, name: "Other" });
    experiment.sceneObjects = [a, b];
    expect(unzipExperiment(zipRawExperiment(experiment))?.experiment).toEqual(
      experiment
    );
  });

  it("returns null when cameraPose is missing", () => {
    const { cameraPose: _cameraPose, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when cameraPose.target holds a non-number", () => {
    const experiment = makeFullExperiment();
    experiment.cameraPose = {
      ...experiment.cameraPose,
      target: [1, "2", 3] as unknown as [number, number, number]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when cameraPoses is missing", () => {
    const { cameraPoses: _cameraPoses, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when a camera pose is malformed", () => {
    const experiment = makeFullExperiment();
    experiment.cameraPoses = [
      {
        ...copyCameraPose(makeCameraPose(), "Dorsal"),
        alpha: "1" as unknown as number
      }
    ];
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when two camera poses share an id", () => {
    const experiment = makeFullExperiment();
    const pose = copyCameraPose(makeCameraPose(), "Dorsal");
    experiment.cameraPoses = [pose, { ...pose, name: "Ventral" }];
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("accepts an experiment with a valid camera pose", () => {
    const experiment = makeFullExperiment();
    addCameraPose(experiment, copyCameraPose(makeCameraPose(), "Dorsal"));
    expect(unzipExperiment(zipRawExperiment(experiment))?.experiment).toEqual(
      experiment
    );
  });

  it("accepts an experiment with a valid scene object", () => {
    const experiment = makeFullExperiment();
    experiment.sceneObjects = [makeSceneObject()];
    expect(unzipExperiment(zipRawExperiment(experiment))?.experiment).toEqual(
      experiment
    );
  });

  it("round-trips coordinateSystems", () => {
    const experiment = makeFullExperiment();
    const zipped = zipExperiment(experiment, new Map());
    expect(unzipExperiment(zipped)?.experiment.coordinateSystems).toEqual(
      experiment.coordinateSystems
    );
  });

  it("accepts a probe interface definition without a probe_planar_contour", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    internProbeInterfaceProbe(experiment, spec);
    const coordinateSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, coordinateSystem);
    addProbe(
      experiment,
      buildProbe(
        spec,
        [0, 0, 0],
        experiment.globalCoordinateSystem,
        experiment.localCoordinateSystem
      )
    );

    // buildProbeContour (src/features/scene/api/probe.api.ts) already
    // degrades to `null` for missing contour geometry, so this is left
    // unvalidated here.
    expect(unzipExperiment(zipRawExperiment(experiment))?.experiment).toEqual(
      experiment
    );
  });

  it("round-trips the experiment's coordinate systems", () => {
    const experiment = makeFullExperiment();
    experiment.globalCoordinateSystem = {
      axes: [
        buildCoordinateAxis("Anterior_to_posterior"),
        buildCoordinateAxis("Superior_to_inferior"),
        buildCoordinateAxis("Right_to_left")
      ],
      positionDisplayOrder: [2, 0, 1],
      rotationDisplayOrder: [1, 2, 0]
    };
    experiment.localCoordinateSystem = {
      depthDirection: "Superior_to_inferior",
      forwardDirection: "Posterior_to_anterior"
    };

    const archive = unzipExperiment(zipExperiment(experiment, new Map()));

    expect(archive?.experiment.globalCoordinateSystem).toEqual(
      experiment.globalCoordinateSystem
    );
    expect(archive?.experiment.localCoordinateSystem).toEqual(
      experiment.localCoordinateSystem
    );
  });

  it("returns null when globalCoordinateSystem is missing", () => {
    const { globalCoordinateSystem: _global, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when localCoordinateSystem is missing", () => {
    const { localCoordinateSystem: _local, ...rest } = makeFullExperiment();
    expect(unzipExperiment(zipRawExperiment(rest))).toBeNull();
  });

  it("returns null when a global coordinate system axis has an unknown direction", () => {
    const experiment = makeFullExperiment();
    experiment.globalCoordinateSystem = {
      ...experiment.globalCoordinateSystem,
      axes: [
        buildCoordinateAxis("Up_to_down" as AnatomicalDirection),
        experiment.globalCoordinateSystem.axes[1],
        experiment.globalCoordinateSystem.axes[2]
      ]
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when a global coordinate system display order repeats an axis", () => {
    const experiment = makeFullExperiment();
    experiment.globalCoordinateSystem = {
      ...experiment.globalCoordinateSystem,
      positionDisplayOrder: [0, 0, 1] as unknown as AxisOrder
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });

  it("returns null when the local coordinate system has an unknown direction", () => {
    const experiment = makeFullExperiment();
    experiment.localCoordinateSystem = {
      depthDirection: "Anterior_to_posterior",
      forwardDirection: "sideways" as AnatomicalDirection
    };
    expect(unzipExperiment(zipRawExperiment(experiment))).toBeNull();
  });
});

describe("buildExperimentFileName", () => {
  it("replaces spaces with dashes", () => {
    const experiment = makeExperiment({ name: "My Experiment" });
    expect(buildExperimentFileName(experiment)).toBe("My-Experiment.zip");
  });

  it("collapses runs of unsafe characters into a single dash", () => {
    const experiment = makeExperiment({ name: "a/b:c*d" });
    expect(buildExperimentFileName(experiment)).toBe("a-b-c-d.zip");
  });

  it("falls back to a default name when nothing safe remains", () => {
    const experiment = makeExperiment({ name: " " });
    expect(buildExperimentFileName(experiment)).toBe("experiment.zip");
  });

  it("falls back to a default name for a name with no ASCII characters", () => {
    const experiment = makeExperiment({ name: "🧠🧠" });
    expect(buildExperimentFileName(experiment)).toBe("experiment.zip");
  });

  it("strips a leading dot so the file isn't hidden", () => {
    const experiment = makeExperiment({ name: ".hidden" });
    expect(buildExperimentFileName(experiment)).toBe("hidden.zip");
  });

  it("truncates a long name without leaving a trailing dash", () => {
    const experiment = makeExperiment({ name: "a".repeat(200) });
    const fileName = buildExperimentFileName(experiment);
    expect(fileName).toBe(`${"a".repeat(64)}.zip`);
    expect(fileName).not.toMatch(/-\.zip$/);
  });

  it("appends .zip even when the name already ends in .zip", () => {
    const experiment = makeExperiment({ name: "exp.zip" });
    expect(buildExperimentFileName(experiment)).toBe("exp.zip.zip");
  });
});
