import { describe, expect, it } from "vitest";
import { isReactive, reactive } from "vue";
import {
  addCameraPose,
  addProbe,
  buildExperiment,
  clearVisibleStructures,
  cloneExperiment,
  getInternedProbeInterfaceProbe,
  internProbeInterfaceProbe,
  isStructureVisible,
  removeCameraPose,
  removeInternProbeInterfaceProbe,
  removeProbe,
  reorderCameraPose,
  reorderProbe,
  setExperimentProperties,
  setProbeInterface,
  setStructureVisibility
} from "./experiment.api";
import { buildCameraPose } from "./camera-pose.api";
import type { Experiment } from "../models/experiment.model";
import { buildProbe, getProbeInterfaceIdentifier } from "@/features/probe";
import { makeAtlas, makeProbe, makeProbeInterfaceProbe } from "@/test/fixtures";

describe("buildExperiment", () => {
  it("returns a new experiment with the given name, atlas, and reference coordinate", () => {
    const atlas = makeAtlas({ name: "allen_human" });

    const experiment = buildExperiment("New Experiment", atlas, [1, 2, 3]);

    expect(experiment.name).toBe("New Experiment");
    expect(experiment.atlas).toEqual(atlas);
    expect(experiment.referenceCoordinate).toEqual([1, 2, 3]);
    expect(experiment.visibleStructures).toEqual([]);
    expect(experiment.probeInterfaceProbes).toEqual({});
    expect(experiment.probes).toEqual([]);
    expect(experiment.cameraPoses).toEqual([]);
  });
});

describe("cloneExperiment", () => {
  it("returns a deep copy independent of the source", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    addProbe(experiment, makeProbe());

    const copy = cloneExperiment(experiment);
    copy.probes[0]!.name = "Mutated";

    expect(experiment.probes[0]!.name).not.toBe("Mutated");
  });

  it("keeps probe interface definitions detached from reactivity", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const spec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, spec);
    const identifier = getProbeInterfaceIdentifier(spec);

    const copy = reactive(cloneExperiment(experiment));

    expect(isReactive(copy.probeInterfaceProbes[identifier])).toBe(false);
    expect(copy.probeInterfaceProbes[identifier]).toEqual(
      makeProbeInterfaceProbe()
    );
  });
});

describe("isStructureVisible", () => {
  it("returns true when the identifier is in visibleStructures", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    experiment.visibleStructures = [5];

    expect(isStructureVisible(experiment, 5)).toBe(true);
  });

  it("returns false when the identifier is not in visibleStructures", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);

    expect(isStructureVisible(experiment, 5)).toBe(false);
  });
});

describe("setStructureVisibility", () => {
  it("adds the identifier when setting visible and not already present", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);

    setStructureVisibility(experiment, 5, true);

    expect(experiment.visibleStructures).toEqual([5]);
  });

  it("does not duplicate the identifier when already visible", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    experiment.visibleStructures = [5];

    setStructureVisibility(experiment, 5, true);

    expect(experiment.visibleStructures).toEqual([5]);
  });

  it("removes the identifier when setting invisible and present", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    experiment.visibleStructures = [5, 6];

    setStructureVisibility(experiment, 5, false);

    expect(experiment.visibleStructures).toEqual([6]);
  });

  it("is a no-op when setting invisible and not present", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    experiment.visibleStructures = [6];

    setStructureVisibility(experiment, 5, false);

    expect(experiment.visibleStructures).toEqual([6]);
  });
});

describe("clearVisibleStructures", () => {
  it("resets visibleStructures to []", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    experiment.visibleStructures = [1, 2, 3];

    clearVisibleStructures(experiment);

    expect(experiment.visibleStructures).toEqual([]);
  });
});

describe("internProbeInterfaceProbe", () => {
  it("stores the definition under the probe's identifier", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const spec = makeProbeInterfaceProbe();

    internProbeInterfaceProbe(experiment, spec);

    expect(experiment.probeInterfaceProbes).toEqual({
      "cambridgeneurotech ASSY-1": spec
    });
  });

  it("does not replace the existing entry when the same definition is interned twice", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const identifier = getProbeInterfaceIdentifier(makeProbeInterfaceProbe());

    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const first = experiment.probeInterfaceProbes[identifier];
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());

    expect(experiment.probeInterfaceProbes[identifier]).toBe(first);
    expect(Object.keys(experiment.probeInterfaceProbes)).toHaveLength(1);
  });

  it("keeps definitions with different identifiers separate", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);

    internProbeInterfaceProbe(
      experiment,
      makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      })
    );
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());

    expect(Object.keys(experiment.probeInterfaceProbes)).toEqual([
      "imec np1",
      "cambridgeneurotech ASSY-1"
    ]);
  });

  it("keeps the first definition when another shares its identifier", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const identifier = getProbeInterfaceIdentifier(makeProbeInterfaceProbe());

    internProbeInterfaceProbe(
      experiment,
      makeProbeInterfaceProbe({ si_units: "um" })
    );
    internProbeInterfaceProbe(
      experiment,
      makeProbeInterfaceProbe({ si_units: "mm" })
    );

    expect(Object.keys(experiment.probeInterfaceProbes)).toHaveLength(1);
    expect(experiment.probeInterfaceProbes[identifier]!.si_units).toBe("um");
  });

  it("detaches the interned definition from Vue's reactivity", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const spec = makeProbeInterfaceProbe();

    internProbeInterfaceProbe(experiment, spec);
    const interned =
      experiment.probeInterfaceProbes[getProbeInterfaceIdentifier(spec)];

    expect(interned).toEqual(spec);
    expect(isReactive(interned)).toBe(false);
  });

  it("does not reflect later mutations of the source definition", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const spec = makeProbeInterfaceProbe();

    internProbeInterfaceProbe(experiment, spec);
    spec.contact_positions.push([9, 9]);

    expect(
      experiment.probeInterfaceProbes[getProbeInterfaceIdentifier(spec)]!
        .contact_positions
    ).toEqual([[0, 0]]);
  });
});

describe("removeInternProbeInterfaceProbe", () => {
  it("removes the definition when no probe references it", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const spec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, spec);

    removeInternProbeInterfaceProbe(
      experiment,
      getProbeInterfaceIdentifier(spec)
    );

    expect(experiment.probeInterfaceProbes).toEqual({});
  });

  it("keeps the definition while a probe still references it", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const spec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, spec);
    const probe = makeProbe();
    addProbe(experiment, probe);

    removeInternProbeInterfaceProbe(experiment, probe.probeInterfaceIdentifier);

    expect(getInternedProbeInterfaceProbe(experiment, probe)).toEqual(spec);
  });

  it("is a no-op when the identifier isn't interned", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());

    removeInternProbeInterfaceProbe(experiment, "imec np1");

    expect(Object.keys(experiment.probeInterfaceProbes)).toEqual([
      "cambridgeneurotech ASSY-1"
    ]);
  });

  it("leaves other interned definitions in place", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const imec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    internProbeInterfaceProbe(experiment, imec);

    removeInternProbeInterfaceProbe(
      experiment,
      getProbeInterfaceIdentifier(imec)
    );

    expect(Object.keys(experiment.probeInterfaceProbes)).toEqual([
      "cambridgeneurotech ASSY-1"
    ]);
  });
});

describe("setProbeInterface", () => {
  it("repoints the probe to the new definition's identifier", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const oldSpec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, oldSpec);
    const probe = makeProbe();
    addProbe(experiment, probe);

    const newSpec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    setProbeInterface(experiment, probe, newSpec);

    expect(probe.probeInterfaceIdentifier).toBe(
      getProbeInterfaceIdentifier(newSpec)
    );
  });

  it("resets shankAlignmentIndex to center", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const oldSpec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, oldSpec);
    const probe = makeProbe({ shankAlignmentIndex: 1 });
    addProbe(experiment, probe);

    const newSpec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    setProbeInterface(experiment, probe, newSpec);

    expect(probe.shankAlignmentIndex).toBeNull();
  });

  it("interns the new definition", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const oldSpec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, oldSpec);
    const probe = makeProbe();
    addProbe(experiment, probe);

    const newSpec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    setProbeInterface(experiment, probe, newSpec);

    expect(getInternedProbeInterfaceProbe(experiment, probe)).toEqual(newSpec);
  });

  it("drops the old definition once nothing else references it", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const oldSpec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, oldSpec);
    const probe = makeProbe();
    addProbe(experiment, probe);

    const newSpec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    setProbeInterface(experiment, probe, newSpec);

    expect(experiment.probeInterfaceProbes).toEqual({
      [getProbeInterfaceIdentifier(newSpec)]: newSpec
    });
  });

  it("keeps the old definition if another probe still references it", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const oldSpec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, oldSpec);
    const probe = makeProbe({ id: "A" });
    const otherProbe = makeProbe({ id: "B" });
    addProbe(experiment, probe);
    addProbe(experiment, otherProbe);

    const newSpec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    setProbeInterface(experiment, probe, newSpec);

    expect(
      experiment.probeInterfaceProbes[getProbeInterfaceIdentifier(oldSpec)]
    ).toEqual(oldSpec);
  });
});

describe("getInternedProbeInterfaceProbe", () => {
  it("resolves a probe's interned definition", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const spec = makeProbeInterfaceProbe({ si_units: "mm" });
    internProbeInterfaceProbe(experiment, spec);
    const probe = buildProbe(spec);

    expect(getInternedProbeInterfaceProbe(experiment, probe)).toEqual(spec);
  });

  it("returns null when the probe's definition isn't in the experiment", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const probe = makeProbe({ probeInterfaceIdentifier: "missing probe" });

    expect(getInternedProbeInterfaceProbe(experiment, probe)).toBeNull();
  });
});

describe("addProbe", () => {
  it("adds the probe to the experiment", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const probe = makeProbe();

    addProbe(experiment, probe);

    expect(experiment.probes).toEqual([probe]);
  });

  it("does nothing when a probe with the same id already exists", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const probe = makeProbe({ id: "dup" });
    addProbe(experiment, probe);

    addProbe(experiment, { ...probe, color: "#000000" });

    expect(experiment.probes).toHaveLength(1);
    expect(experiment.probes[0]!.color).toBe(probe.color);
  });

  it("adds probes that share a name but have different ids", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());

    addProbe(experiment, makeProbe({ id: "a", name: "Probe" }));
    addProbe(experiment, makeProbe({ id: "b", name: "Probe" }));

    expect(experiment.probes).toHaveLength(2);
  });
});

describe("removeProbe", () => {
  it("removes the probe from the experiment", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const probe = makeProbe();
    addProbe(experiment, probe);

    removeProbe(experiment, probe);

    expect(experiment.probes).toEqual([]);
  });

  it("is a no-op when the probe's id isn't in the experiment", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const kept = makeProbe({ id: "kept" });
    addProbe(experiment, kept);

    removeProbe(experiment, makeProbe({ id: "never-added" }));

    expect(experiment.probes).toEqual([kept]);
  });

  it("drops the probe's definition once no probe references it anymore", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const probe = makeProbe();
    addProbe(experiment, probe);

    removeProbe(experiment, probe);

    expect(experiment.probeInterfaceProbes).toEqual({});
  });
});

describe("reorderProbe", () => {
  function makeThreeProbes(experiment: Experiment) {
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const a = makeProbe({ id: "a", name: "A" });
    const b = makeProbe({ id: "b", name: "B" });
    const c = makeProbe({ id: "c", name: "C" });
    addProbe(experiment, a);
    addProbe(experiment, b);
    addProbe(experiment, c);
    return [a, b, c];
  }

  it("moves a probe to the dropped-on index", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const [a, b, c] = makeThreeProbes(experiment);

    reorderProbe(experiment, 0, 2);

    expect(experiment.probes).toEqual([b, c, a]);
  });

  it("is a no-op for equal indices", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const probes = makeThreeProbes(experiment);

    reorderProbe(experiment, 1, 1);

    expect(experiment.probes).toEqual(probes);
  });

  it("is a no-op for an out-of-range index", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const probes = makeThreeProbes(experiment);

    reorderProbe(experiment, 0, 3);

    expect(experiment.probes).toEqual(probes);
  });
});

describe("addCameraPose", () => {
  it("adds the pose to the experiment", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const pose = buildCameraPose("Dorsal", [1, 2, 3]);

    addCameraPose(experiment, pose);

    expect(experiment.cameraPoses).toEqual([pose]);
  });

  it("does nothing when a pose with the same id already exists", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const pose = { ...buildCameraPose("Dorsal", [1, 2, 3]), id: "dup" };
    addCameraPose(experiment, pose);

    addCameraPose(experiment, { ...pose, name: "Other" });

    expect(experiment.cameraPoses).toHaveLength(1);
    expect(experiment.cameraPoses[0]!.name).toBe(pose.name);
  });
});

describe("removeCameraPose", () => {
  it("removes the pose from the experiment", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const pose = buildCameraPose("Dorsal", [1, 2, 3]);
    addCameraPose(experiment, pose);

    removeCameraPose(experiment, pose);

    expect(experiment.cameraPoses).toEqual([]);
  });

  it("is a no-op when the pose's id isn't in the experiment", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const kept = buildCameraPose("Dorsal", [1, 2, 3]);
    addCameraPose(experiment, kept);

    removeCameraPose(experiment, { ...kept, id: "never-added" });

    expect(experiment.cameraPoses).toEqual([kept]);
  });
});

describe("reorderCameraPose", () => {
  function makeThreePoses(experiment: Experiment) {
    const a = buildCameraPose("A", [1, 0, 0]);
    const b = buildCameraPose("B", [2, 0, 0]);
    const c = buildCameraPose("C", [3, 0, 0]);
    addCameraPose(experiment, a);
    addCameraPose(experiment, b);
    addCameraPose(experiment, c);
    return [a, b, c];
  }

  it("moves a pose to the dropped-on index", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const [a, b, c] = makeThreePoses(experiment);

    reorderCameraPose(experiment, 0, 2);

    expect(experiment.cameraPoses).toEqual([b, c, a]);
  });

  it("is a no-op for equal indices", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const poses = makeThreePoses(experiment);

    reorderCameraPose(experiment, 1, 1);

    expect(experiment.cameraPoses).toEqual(poses);
  });

  it("is a no-op for an out-of-range index", () => {
    const experiment = buildExperiment("Exp", makeAtlas(), [0, 0, 0]);
    const poses = makeThreePoses(experiment);

    reorderCameraPose(experiment, 0, 3);

    expect(experiment.cameraPoses).toEqual(poses);
  });
});

describe("setExperimentProperties", () => {
  it("writes trimmed name, atlas, and reference coordinate onto the same experiment object", () => {
    const experiment = buildExperiment("Old", makeAtlas(), [0, 0, 0]);
    const atlas = makeAtlas({ name: "allen_human" });

    setExperimentProperties(experiment, {
      name: "  New Name  ",
      atlas,
      referenceCoordinate: [1, 2, 3]
    });

    expect(experiment.name).toBe("New Name");
    expect(experiment.atlas).toEqual(atlas);
    expect(experiment.referenceCoordinate).toEqual([1, 2, 3]);
  });

  it("does not alias the caller's arrays", () => {
    const experiment = buildExperiment("Old", makeAtlas(), [0, 0, 0]);
    const referenceCoordinate: [number, number, number] = [1, 2, 3];

    setExperimentProperties(experiment, {
      name: "New",
      atlas: makeAtlas(),
      referenceCoordinate
    });
    referenceCoordinate[0] = 99;

    expect(experiment.referenceCoordinate).toEqual([1, 2, 3]);
  });

  it("clears visibleStructures when the atlas name differs", () => {
    const experiment = buildExperiment("Old", makeAtlas(), [0, 0, 0]);
    experiment.visibleStructures = [1, 2, 3];

    setExperimentProperties(experiment, {
      name: "New",
      atlas: makeAtlas({ name: "allen_human" }),
      referenceCoordinate: [0, 0, 0]
    });

    expect(experiment.visibleStructures).toEqual([]);
  });

  it("clears visibleStructures when only the source differs", () => {
    const experiment = buildExperiment("Old", makeAtlas(), [0, 0, 0]);
    experiment.visibleStructures = [1, 2, 3];

    setExperimentProperties(experiment, {
      name: "New",
      atlas: makeAtlas({ source: "https://other.test" }),
      referenceCoordinate: [0, 0, 0]
    });

    expect(experiment.visibleStructures).toEqual([]);
  });

  it("keeps visibleStructures when a structurally equal but distinct atlas object is passed", () => {
    const experiment = buildExperiment("Old", makeAtlas(), [0, 0, 0]);
    experiment.visibleStructures = [1, 2, 3];

    setExperimentProperties(experiment, {
      name: "New",
      atlas: makeAtlas(),
      referenceCoordinate: [0, 0, 0]
    });

    expect(experiment.visibleStructures).toEqual([1, 2, 3]);
  });
});
