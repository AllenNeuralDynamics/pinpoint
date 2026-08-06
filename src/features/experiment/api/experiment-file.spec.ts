import { describe, expect, it } from "vitest";
import {
  buildExperimentFileName,
  parseExperimentFile,
  serializeExperiment
} from "./experiment-file.api";
import {
  addCameraPose,
  addProbe,
  buildExperiment,
  internProbeInterfaceProbe
} from "./experiment.api";
import { buildCameraPose } from "./camera-pose.api";
import { buildProbe, detachProbeInterfaceProbe } from "@/features/probe";
import { makeAtlas, makeProbeInterfaceProbe } from "@/test/fixtures";
import type { Experiment } from "../models/experiment.model";

/**
 * Build an experiment with one interned probe interface definition and one
 * probe referencing it, for round-trip and validation tests.
 */
function makeFullExperiment(): Experiment {
  const experiment = buildExperiment("My Experiment", makeAtlas(), [1, 2, 3]);
  const spec = makeProbeInterfaceProbe({
    annotations: { manufacturer: "imec", model_name: "np1" }
  });
  internProbeInterfaceProbe(experiment, spec);
  addProbe(experiment, buildProbe(spec));
  experiment.visibleStructures = [5];
  return experiment;
}

describe("serializeExperiment", () => {
  it("pretty-prints with 2-space indentation", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    expect(serializeExperiment(experiment)).toContain('\n  "name"');
  });

  it("round-trips through parseExperimentFile", () => {
    const experiment = makeFullExperiment();
    expect(parseExperimentFile(serializeExperiment(experiment))).toEqual(
      experiment
    );
  });

  it("does not leak markRaw's non-enumerable marker into the output", () => {
    const experiment = makeFullExperiment();
    const identifier = Object.keys(experiment.probeInterfaceProbes)[0]!;
    experiment.probeInterfaceProbes[identifier] = detachProbeInterfaceProbe(
      experiment.probeInterfaceProbes[identifier]!
    );

    expect(serializeExperiment(experiment)).not.toContain("__v_skip");
  });
});

describe("parseExperimentFile", () => {
  it("returns null for invalid JSON", () => {
    expect(parseExperimentFile("not json")).toBeNull();
  });

  it("returns null when parsed JSON is an array", () => {
    expect(parseExperimentFile("[]")).toBeNull();
  });

  it("returns null when parsed JSON is null", () => {
    expect(parseExperimentFile("null")).toBeNull();
  });

  it("returns null when id is missing", () => {
    const { id: _id, ...rest } = makeFullExperiment();
    expect(parseExperimentFile(JSON.stringify(rest))).toBeNull();
  });

  it("returns null when version is missing", () => {
    const { version: _version, ...rest } = makeFullExperiment();
    expect(parseExperimentFile(JSON.stringify(rest))).toBeNull();
  });

  it("returns null when name is missing", () => {
    const { name: _name, ...rest } = makeFullExperiment();
    expect(parseExperimentFile(JSON.stringify(rest))).toBeNull();
  });

  it("returns null when name has the wrong type", () => {
    const experiment = { ...makeFullExperiment(), name: 5 };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when atlas is missing", () => {
    const { atlas: _atlas, ...rest } = makeFullExperiment();
    expect(parseExperimentFile(JSON.stringify(rest))).toBeNull();
  });

  it("returns null when atlas.source has the wrong type", () => {
    const experiment = makeFullExperiment();
    experiment.atlas = { ...experiment.atlas, source: 5 as unknown as string };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when atlas.manifest is missing", () => {
    const experiment = makeFullExperiment();
    const { manifest: _manifest, ...atlasWithoutManifest } = experiment.atlas;
    experiment.atlas = atlasWithoutManifest as Experiment["atlas"];
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when referenceCoordinate has the wrong length", () => {
    const experiment = {
      ...makeFullExperiment(),
      referenceCoordinate: [1, 2] as unknown as [number, number, number]
    };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when referenceCoordinate contains a non-number", () => {
    const experiment = {
      ...makeFullExperiment(),
      referenceCoordinate: [1, 2, "3"] as unknown as [number, number, number]
    };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when visibleStructures contains a non-number", () => {
    const experiment = {
      ...makeFullExperiment(),
      visibleStructures: ["1"] as unknown as number[]
    };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when probeInterfaceProbes is an array", () => {
    const experiment = {
      ...makeFullExperiment(),
      probeInterfaceProbes: [] as unknown as Experiment["probeInterfaceProbes"]
    };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when a probe interface definition is missing annotations", () => {
    const experiment = makeFullExperiment();
    const identifier = Object.keys(experiment.probeInterfaceProbes)[0]!;
    const { annotations: _annotations, ...definition } =
      experiment.probeInterfaceProbes[identifier]!;
    experiment.probeInterfaceProbes[identifier] =
      definition as Experiment["probeInterfaceProbes"][string];

    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when a probe interface definition's key does not match its derived identifier", () => {
    const experiment = makeFullExperiment();
    const identifier = Object.keys(experiment.probeInterfaceProbes)[0]!;
    const definition = experiment.probeInterfaceProbes[identifier]!;
    delete experiment.probeInterfaceProbes[identifier];
    // A mismatched key would make `syncProbes` (src/features/scene/api/probe.api.ts)
    // dispose and rebuild the probe's meshes on every sync pass.
    experiment.probeInterfaceProbes["wrong identifier"] = definition;

    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when probes is not an array", () => {
    const experiment = {
      ...makeFullExperiment(),
      probes: {} as unknown as Experiment["probes"]
    };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when a probe has an invalid inspectableKind", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = {
      ...experiment.probes[0]!,
      inspectableKind: "atlas" as "probe"
    };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when a probe has an unknown visibility", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = {
      ...experiment.probes[0]!,
      visibility: "invisible" as Experiment["probes"][number]["visibility"]
    };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when a probe has an invalid color", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = { ...experiment.probes[0]!, color: "red" };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when a probe has a short tipPosition", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = {
      ...experiment.probes[0]!,
      tipPosition: [0, 0] as unknown as [number, number, number]
    };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when a probe is missing slice-view fields, e.g. from an experiment saved before they existed", () => {
    const experiment = makeFullExperiment();
    const { sliceExtentMillimeters: _extent, ...probe } = experiment.probes[0]!;
    experiment.probes[0] = probe as Experiment["probes"][number];
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when two probes share an id", () => {
    const experiment = makeFullExperiment();
    const spec =
      experiment.probeInterfaceProbes[
        Object.keys(experiment.probeInterfaceProbes)[0]!
      ]!;
    const duplicate = { ...buildProbe(spec), id: experiment.probes[0]!.id };
    experiment.probes.push(duplicate);

    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when a probe's probeInterfaceIdentifier is dangling", () => {
    const experiment = makeFullExperiment();
    experiment.probes[0] = {
      ...experiment.probes[0]!,
      probeInterfaceIdentifier: "missing identifier"
    };
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when cameraPoses is missing", () => {
    const { cameraPoses: _cameraPoses, ...rest } = makeFullExperiment();
    expect(parseExperimentFile(JSON.stringify(rest))).toBeNull();
  });

  it("returns null when a camera pose is malformed", () => {
    const experiment = makeFullExperiment();
    experiment.cameraPoses = [
      {
        ...buildCameraPose("Dorsal", [1, 2, 3]),
        alpha: "1" as unknown as number
      }
    ];
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("returns null when two camera poses share an id", () => {
    const experiment = makeFullExperiment();
    const pose = buildCameraPose("Dorsal", [1, 2, 3]);
    experiment.cameraPoses = [pose, { ...pose, name: "Ventral" }];
    expect(parseExperimentFile(JSON.stringify(experiment))).toBeNull();
  });

  it("accepts an experiment with a valid camera pose", () => {
    const experiment = makeFullExperiment();
    addCameraPose(experiment, buildCameraPose("Dorsal", [1, 2, 3]));
    expect(parseExperimentFile(JSON.stringify(experiment))).toEqual(experiment);
  });

  it("accepts a probe interface definition without a probe_planar_contour", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    internProbeInterfaceProbe(experiment, spec);
    addProbe(experiment, buildProbe(spec));

    // buildProbeContour (src/features/scene/api/probe.api.ts) already
    // degrades to `null` for missing contour geometry, so this is left
    // unvalidated here.
    expect(parseExperimentFile(JSON.stringify(experiment))).toEqual(experiment);
  });
});

describe("buildExperimentFileName", () => {
  it("replaces spaces with dashes", () => {
    const experiment = buildExperiment("My Experiment", makeAtlas(), [0, 0, 0]);
    expect(buildExperimentFileName(experiment)).toBe("My-Experiment.json");
  });

  it("collapses runs of unsafe characters into a single dash", () => {
    const experiment = buildExperiment("a/b:c*d", makeAtlas(), [0, 0, 0]);
    expect(buildExperimentFileName(experiment)).toBe("a-b-c-d.json");
  });

  it("falls back to a default name when nothing safe remains", () => {
    const experiment = buildExperiment("   ", makeAtlas(), [0, 0, 0]);
    expect(buildExperimentFileName(experiment)).toBe("experiment.json");
  });

  it("falls back to a default name for a name with no ASCII characters", () => {
    const experiment = buildExperiment("🧠🧠", makeAtlas(), [0, 0, 0]);
    expect(buildExperimentFileName(experiment)).toBe("experiment.json");
  });

  it("strips a leading dot so the file isn't hidden", () => {
    const experiment = buildExperiment(".hidden", makeAtlas(), [0, 0, 0]);
    expect(buildExperimentFileName(experiment)).toBe("hidden.json");
  });

  it("truncates a long name without leaving a trailing dash", () => {
    const experiment = buildExperiment("a".repeat(200), makeAtlas(), [0, 0, 0]);
    const fileName = buildExperimentFileName(experiment);
    expect(fileName).toBe(`${"a".repeat(64)}.json`);
    expect(fileName).not.toMatch(/-\.json$/);
  });

  it("appends .json even when the name already ends in .json", () => {
    const experiment = buildExperiment("exp.json", makeAtlas(), [0, 0, 0]);
    expect(buildExperimentFileName(experiment)).toBe("exp.json.json");
  });
});
