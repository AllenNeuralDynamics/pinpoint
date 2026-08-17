import { describe, expect, it } from "vitest";
import { isReactive, reactive } from "vue";
import {
  addCameraPose,
  addProbe,
  addSceneObject,
  buildExperiment,
  cloneExperiment,
  getExperimentModelIds,
  getInternedProbeInterfaceProbe,
  getVisibleStructure,
  internCoordinateSystem,
  internProbeInterfaceProbe,
  isStructureVisible,
  removeCameraPose,
  removeInternCoordinateSystem,
  removeInternProbeInterfaceProbe,
  removeProbe,
  reorderCameraPose,
  reorderProbe,
  resetStructureVisibility,
  setExperimentGlobalCoordinateSystem,
  setExperimentLocalCoordinateSystem,
  setExperimentProperties,
  setProbeCoordinateSystem,
  setProbeInterface,
  setStructureVisibility,
  updateInternedCoordinateSystem
} from "./experiment.api";
import {
  copyCameraPose,
  getAtlasFramingRadiusMillimeters
} from "./camera-pose.api";
import type { Experiment } from "../models/experiment.model";
import { buildProbe, getProbeInterfaceIdentifier } from "@/features/probe";
import { getAtlasCenter } from "@/features/atlas";
import { getCoordinateSystemIdentifier } from "@/features/coordinate-system";
import {
  makeAtlas,
  makeCameraPose,
  makeCoordinateSystem,
  makeExperiment,
  makeManifest,
  makeProbe,
  makeProbeInterfaceProbe,
  makeSceneModel,
  makeSceneObject
} from "@/test/fixtures";
import {
  ATLAS_AXIS_DIRECTIONS,
  buildCoordinateAxis,
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  convertCoordinate,
  getAxisDirections,
  getRotationMatrix,
  type GlobalCoordinateSystem
} from "@/utils/coordinate-frame";

describe("buildExperiment", () => {
  it("returns a new experiment with the given name, atlas, coordinate systems, and reference coordinate", () => {
    const atlas = makeAtlas({ name: "allen_human" });
    const globalCoordinateSystem = buildDefaultGlobalCoordinateSystem();
    const localCoordinateSystem = buildDefaultLocalCoordinateSystem();

    const experiment = buildExperiment(
      "New Experiment",
      atlas,
      globalCoordinateSystem,
      localCoordinateSystem,
      [1, 2, 3]
    );

    expect(experiment.name).toBe("New Experiment");
    expect(experiment.atlas).toEqual(atlas);
    expect(experiment.globalCoordinateSystem).toEqual(globalCoordinateSystem);
    expect(experiment.localCoordinateSystem).toEqual(localCoordinateSystem);
    expect(experiment.referenceCoordinate).toEqual([1, 2, 3]);
    expect(experiment.visibleStructures).toEqual([]);
    expect(experiment.probeInterfaceProbes).toEqual({});
    expect(experiment.coordinateSystems).toEqual({});
    expect(experiment.probes).toEqual([]);
    expect(experiment.cameraPoses).toEqual([]);
  });

  it("seeds the camera pose with the atlas centre expressed in the given coordinate system", () => {
    const atlas = makeAtlas();

    const experiment = buildExperiment(
      "New Experiment",
      atlas,
      buildDefaultGlobalCoordinateSystem(),
      buildDefaultLocalCoordinateSystem(),
      [0, 0, 0]
    );

    // The atlas origin is the corner its own axes start from, so in the
    // default right-anterior-superior system the centre sits half the atlas's
    // extent toward the animal's right, posterior and inferior.
    const [ap, si, ml] = getAtlasCenter(atlas);
    expect(experiment.cameraPose.target[0]).toBeCloseTo(ml);
    expect(experiment.cameraPose.target[1]).toBeCloseTo(-ap);
    expect(experiment.cameraPose.target[2]).toBeCloseTo(-si);
  });

  it("seeds visibleStructures with the default structure identifiers as transparent", () => {
    const experiment = buildExperiment(
      "E",
      makeAtlas(),
      buildDefaultGlobalCoordinateSystem(),
      buildDefaultLocalCoordinateSystem(),
      [0, 0, 0],
      [1, 2]
    );

    expect(experiment.visibleStructures).toEqual([
      { id: 1, isTransparent: true },
      { id: 2, isTransparent: true }
    ]);
  });
});

describe("cloneExperiment", () => {
  it("returns a deep copy independent of the source", () => {
    const experiment = makeExperiment({ name: "Exp" });
    addProbe(experiment, makeProbe());

    const copy = cloneExperiment(experiment);
    copy.probes[0]!.name = "Mutated";

    expect(experiment.probes[0]!.name).not.toBe("Mutated");
  });

  it("keeps probe interface definitions detached from reactivity", () => {
    const experiment = makeExperiment({ name: "Exp" });
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
  it("returns true for an opaque entry", () => {
    const experiment = makeExperiment({ name: "Exp" });
    experiment.visibleStructures = [{ id: 5, isTransparent: false }];

    expect(isStructureVisible(experiment, 5)).toBe(true);
  });

  it("returns false for a transparent entry", () => {
    const experiment = makeExperiment({ name: "Exp" });
    experiment.visibleStructures = [{ id: 5, isTransparent: true }];

    expect(isStructureVisible(experiment, 5)).toBe(false);
  });

  it("returns false when the identifier is absent", () => {
    const experiment = makeExperiment({ name: "Exp" });

    expect(isStructureVisible(experiment, 5)).toBe(false);
  });
});

describe("setStructureVisibility", () => {
  it("appends an opaque entry when setting true on an absent id", () => {
    const experiment = makeExperiment({ name: "Exp" });

    setStructureVisibility(experiment, 5, true);

    expect(experiment.visibleStructures).toEqual([
      { id: 5, isTransparent: false }
    ]);
  });

  it("appends a transparent entry when setting null on an absent id", () => {
    const experiment = makeExperiment({ name: "Exp" });

    setStructureVisibility(experiment, 5, null);

    expect(experiment.visibleStructures).toEqual([
      { id: 5, isTransparent: true }
    ]);
  });

  it("replaces a transparent entry with an opaque one in place", () => {
    const experiment = makeExperiment({ name: "Exp" });
    experiment.visibleStructures = [{ id: 5, isTransparent: true }];

    setStructureVisibility(experiment, 5, true);

    expect(experiment.visibleStructures).toEqual([
      { id: 5, isTransparent: false }
    ]);
  });

  it("removes the entry when setting false and present", () => {
    const experiment = makeExperiment({ name: "Exp" });
    experiment.visibleStructures = [
      { id: 5, isTransparent: false },
      { id: 6, isTransparent: false }
    ];

    setStructureVisibility(experiment, 5, false);

    expect(experiment.visibleStructures).toEqual([
      { id: 6, isTransparent: false }
    ]);
  });

  it("is a no-op when setting false and not present", () => {
    const experiment = makeExperiment({ name: "Exp" });
    experiment.visibleStructures = [{ id: 6, isTransparent: false }];

    setStructureVisibility(experiment, 5, false);

    expect(experiment.visibleStructures).toEqual([
      { id: 6, isTransparent: false }
    ]);
  });

  it("leaves exactly one entry when called twice with true", () => {
    const experiment = makeExperiment({ name: "Exp" });

    setStructureVisibility(experiment, 5, true);
    setStructureVisibility(experiment, 5, true);

    expect(experiment.visibleStructures).toEqual([
      { id: 5, isTransparent: false }
    ]);
  });
});

describe("getVisibleStructure", () => {
  it("returns the entry for a shown structure", () => {
    const experiment = makeExperiment({ name: "Exp" });
    experiment.visibleStructures = [{ id: 5, isTransparent: false }];

    expect(getVisibleStructure(experiment, 5)).toEqual({
      id: 5,
      isTransparent: false
    });
  });

  it("returns null when the identifier is absent", () => {
    const experiment = makeExperiment({ name: "Exp" });

    expect(getVisibleStructure(experiment, 5)).toBeNull();
  });
});

describe("resetStructureVisibility", () => {
  it("resets visibleStructures to the transparent defaults", () => {
    const experiment = makeExperiment({ name: "Exp" });
    experiment.visibleStructures = [
      { id: 1, isTransparent: false },
      { id: 3, isTransparent: false }
    ];

    resetStructureVisibility(experiment, [1, 2]);

    expect(experiment.visibleStructures).toEqual([
      { id: 1, isTransparent: true },
      { id: 2, isTransparent: true }
    ]);
  });
});

describe("internProbeInterfaceProbe", () => {
  it("stores the definition under the probe's identifier", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const spec = makeProbeInterfaceProbe();

    internProbeInterfaceProbe(experiment, spec);

    expect(experiment.probeInterfaceProbes).toEqual({
      "cambridgeneurotech ASSY-1": spec
    });
  });

  it("does not replace the existing entry when the same definition is interned twice", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const identifier = getProbeInterfaceIdentifier(makeProbeInterfaceProbe());

    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const first = experiment.probeInterfaceProbes[identifier];
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());

    expect(experiment.probeInterfaceProbes[identifier]).toBe(first);
    expect(Object.keys(experiment.probeInterfaceProbes)).toHaveLength(1);
  });

  it("keeps definitions with different identifiers separate", () => {
    const experiment = makeExperiment({ name: "Exp" });

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
    const experiment = makeExperiment({ name: "Exp" });
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
    const experiment = makeExperiment({ name: "Exp" });
    const spec = makeProbeInterfaceProbe();

    internProbeInterfaceProbe(experiment, spec);
    const interned =
      experiment.probeInterfaceProbes[getProbeInterfaceIdentifier(spec)];

    expect(interned).toEqual(spec);
    expect(isReactive(interned)).toBe(false);
  });

  it("does not reflect later mutations of the source definition", () => {
    const experiment = makeExperiment({ name: "Exp" });
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
    const experiment = makeExperiment({ name: "Exp" });
    const spec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, spec);

    removeInternProbeInterfaceProbe(
      experiment,
      getProbeInterfaceIdentifier(spec)
    );

    expect(experiment.probeInterfaceProbes).toEqual({});
  });

  it("keeps the definition while a probe still references it", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const spec = makeProbeInterfaceProbe();
    internProbeInterfaceProbe(experiment, spec);
    const probe = makeProbe();
    addProbe(experiment, probe);

    removeInternProbeInterfaceProbe(experiment, probe.probeInterfaceIdentifier);

    expect(getInternedProbeInterfaceProbe(experiment, probe)).toEqual(spec);
  });

  it("is a no-op when the identifier isn't interned", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());

    removeInternProbeInterfaceProbe(experiment, "imec np1");

    expect(Object.keys(experiment.probeInterfaceProbes)).toEqual([
      "cambridgeneurotech ASSY-1"
    ]);
  });

  it("leaves other interned definitions in place", () => {
    const experiment = makeExperiment({ name: "Exp" });
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
    const experiment = makeExperiment({ name: "Exp" });
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
    const experiment = makeExperiment({ name: "Exp" });
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
    const experiment = makeExperiment({ name: "Exp" });
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
    const experiment = makeExperiment({ name: "Exp" });
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
    const experiment = makeExperiment({ name: "Exp" });
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

describe("internCoordinateSystem", () => {
  it("stores the definition under the coordinate system's id", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const coordinateSystem = makeCoordinateSystem();

    internCoordinateSystem(experiment, coordinateSystem);

    expect(experiment.coordinateSystems).toEqual({
      [coordinateSystem.id]: coordinateSystem
    });
  });

  it("keeps the first-interned object when the same identifier is interned twice", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const identifier = getCoordinateSystemIdentifier(makeCoordinateSystem());

    internCoordinateSystem(experiment, makeCoordinateSystem({ name: "First" }));
    const first = experiment.coordinateSystems[identifier];
    internCoordinateSystem(
      experiment,
      makeCoordinateSystem({ name: "Second" })
    );

    expect(experiment.coordinateSystems[identifier]).toBe(first);
    expect(Object.keys(experiment.coordinateSystems)).toHaveLength(1);
  });

  it("does not alias the source coordinate system", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const source = makeCoordinateSystem();

    internCoordinateSystem(experiment, source);
    source.chain[0]!.name = "Mutated";

    expect(experiment.coordinateSystems[source.id]!.chain[0]!.name).toBe("Tip");
  });
});

describe("updateInternedCoordinateSystem", () => {
  it("rewrites the interned copy with the passed definition", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internCoordinateSystem(experiment, makeCoordinateSystem());
    const identifier = getCoordinateSystemIdentifier(makeCoordinateSystem());

    updateInternedCoordinateSystem(
      experiment,
      makeCoordinateSystem({ name: "Renamed" })
    );

    expect(experiment.coordinateSystems[identifier]!.name).toBe("Renamed");
  });

  it("is a no-op when nothing is interned under that identifier", () => {
    const experiment = makeExperiment({ name: "Exp" });

    updateInternedCoordinateSystem(experiment, makeCoordinateSystem());

    expect(experiment.coordinateSystems).toEqual({});
  });

  it("keeps the same object when the definition is unchanged", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internCoordinateSystem(experiment, makeCoordinateSystem());
    const identifier = getCoordinateSystemIdentifier(makeCoordinateSystem());
    const captured = experiment.coordinateSystems[identifier];

    updateInternedCoordinateSystem(experiment, makeCoordinateSystem());

    expect(experiment.coordinateSystems[identifier]).toBe(captured);
  });

  it("does not alias the source coordinate system", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internCoordinateSystem(experiment, makeCoordinateSystem());
    const identifier = getCoordinateSystemIdentifier(makeCoordinateSystem());
    const source = makeCoordinateSystem({ name: "Renamed" });

    updateInternedCoordinateSystem(experiment, source);
    source.chain[0]!.name = "Mutated";

    expect(experiment.coordinateSystems[identifier]!.chain[0]!.name).toBe(
      "Tip"
    );
  });
});

describe("removeInternCoordinateSystem", () => {
  it("removes the definition when no probe references it", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const coordinateSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, coordinateSystem);

    removeInternCoordinateSystem(experiment, coordinateSystem.id);

    expect(experiment.coordinateSystems).toEqual({});
  });

  it("keeps the definition while a probe still references it", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const coordinateSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, coordinateSystem);
    const probe = makeProbe({
      coordinateSystemIdentifier: coordinateSystem.id
    });
    addProbe(experiment, probe);

    removeInternCoordinateSystem(experiment, probe.coordinateSystemIdentifier);

    expect(experiment.coordinateSystems[coordinateSystem.id]).toEqual(
      coordinateSystem
    );
  });

  it("is a no-op when the identifier isn't interned", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internCoordinateSystem(experiment, makeCoordinateSystem());

    removeInternCoordinateSystem(experiment, "missing-id");

    expect(Object.keys(experiment.coordinateSystems)).toEqual([
      "coordinate-system-id"
    ]);
  });
});

describe("setProbeCoordinateSystem", () => {
  it("repoints the probe to the new coordinate system's identifier", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const oldSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, oldSystem);
    const probe = makeProbe();
    addProbe(experiment, probe);

    const newSystem = makeCoordinateSystem({ id: "other-id", name: "Other" });
    setProbeCoordinateSystem(experiment, probe, newSystem);

    expect(probe.coordinateSystemIdentifier).toBe("other-id");
  });

  it("overwrites the entry with the passed definition", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const oldSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, oldSystem);
    const probe = makeProbe();
    addProbe(experiment, probe);

    const newSystem = makeCoordinateSystem({ id: "other-id", name: "Other" });
    setProbeCoordinateSystem(experiment, probe, newSystem);

    expect(experiment.coordinateSystems["other-id"]).toEqual(newSystem);
  });

  it("drops the old entry once nothing else references it", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const oldSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, oldSystem);
    const probe = makeProbe({ coordinateSystemIdentifier: oldSystem.id });
    addProbe(experiment, probe);

    const newSystem = makeCoordinateSystem({ id: "other-id", name: "Other" });
    setProbeCoordinateSystem(experiment, probe, newSystem);

    expect(experiment.coordinateSystems[oldSystem.id]).toBeUndefined();
  });

  it("keeps the old entry if another probe still references it", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const oldSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, oldSystem);
    const probe = makeProbe({
      id: "A",
      coordinateSystemIdentifier: oldSystem.id
    });
    const otherProbe = makeProbe({
      id: "B",
      coordinateSystemIdentifier: oldSystem.id
    });
    addProbe(experiment, probe);
    addProbe(experiment, otherProbe);

    const newSystem = makeCoordinateSystem({ id: "other-id", name: "Other" });
    setProbeCoordinateSystem(experiment, probe, newSystem);

    expect(experiment.coordinateSystems[oldSystem.id]).toEqual(oldSystem);
  });

  it("nulls the probe's identifier when passed null", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const oldSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, oldSystem);
    const probe = makeProbe({ coordinateSystemIdentifier: oldSystem.id });
    addProbe(experiment, probe);

    setProbeCoordinateSystem(experiment, probe, null);

    expect(probe.coordinateSystemIdentifier).toBeNull();
    expect(experiment.coordinateSystems[oldSystem.id]).toBeUndefined();
  });

  it("keeps the old entry when nulled while another probe still references it", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const oldSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, oldSystem);
    const probe = makeProbe({
      id: "A",
      coordinateSystemIdentifier: oldSystem.id
    });
    const otherProbe = makeProbe({
      id: "B",
      coordinateSystemIdentifier: oldSystem.id
    });
    addProbe(experiment, probe);
    addProbe(experiment, otherProbe);

    setProbeCoordinateSystem(experiment, probe, null);

    expect(experiment.coordinateSystems[oldSystem.id]).toEqual(oldSystem);
  });
});

describe("getInternedProbeInterfaceProbe", () => {
  it("resolves a probe's interned definition", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const spec = makeProbeInterfaceProbe({ si_units: "mm" });
    internProbeInterfaceProbe(experiment, spec);
    const probe = buildProbe(
      spec,
      [0, 0, 0],
      experiment.globalCoordinateSystem,
      experiment.localCoordinateSystem
    );

    expect(getInternedProbeInterfaceProbe(experiment, probe)).toEqual(spec);
  });

  it("returns null when the probe's definition isn't in the experiment", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const probe = makeProbe({ probeInterfaceIdentifier: "missing probe" });

    expect(getInternedProbeInterfaceProbe(experiment, probe)).toBeNull();
  });
});

describe("addProbe", () => {
  it("adds the probe to the experiment", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const probe = makeProbe();

    addProbe(experiment, probe);

    expect(experiment.probes).toEqual([probe]);
  });

  it("does nothing when a probe with the same id already exists", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const probe = makeProbe({ id: "dup" });
    addProbe(experiment, probe);

    addProbe(experiment, { ...probe, color: "#000000" });

    expect(experiment.probes).toHaveLength(1);
    expect(experiment.probes[0]!.color).toBe(probe.color);
  });

  it("adds probes that share a name but have different ids", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());

    addProbe(experiment, makeProbe({ id: "a", name: "Probe" }));
    addProbe(experiment, makeProbe({ id: "b", name: "Probe" }));

    expect(experiment.probes).toHaveLength(2);
  });
});

describe("removeProbe", () => {
  it("removes the probe from the experiment", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const probe = makeProbe();
    addProbe(experiment, probe);

    removeProbe(experiment, probe);

    expect(experiment.probes).toEqual([]);
  });

  it("is a no-op when the probe's id isn't in the experiment", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const kept = makeProbe({ id: "kept" });
    addProbe(experiment, kept);

    removeProbe(experiment, makeProbe({ id: "never-added" }));

    expect(experiment.probes).toEqual([kept]);
  });

  it("drops the probe's definition once no probe references it anymore", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const probe = makeProbe();
    addProbe(experiment, probe);

    removeProbe(experiment, probe);

    expect(experiment.probeInterfaceProbes).toEqual({});
  });

  it("drops the probe's coordinate system once no probe references it anymore", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const coordinateSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, coordinateSystem);
    const probe = makeProbe({
      coordinateSystemIdentifier: coordinateSystem.id
    });
    addProbe(experiment, probe);

    removeProbe(experiment, probe);

    expect(experiment.coordinateSystems).toEqual({});
  });

  it("keeps the coordinate system while another probe still references it", () => {
    const experiment = makeExperiment({ name: "Exp" });
    internProbeInterfaceProbe(experiment, makeProbeInterfaceProbe());
    const coordinateSystem = makeCoordinateSystem();
    internCoordinateSystem(experiment, coordinateSystem);
    const probe = makeProbe({
      id: "A",
      coordinateSystemIdentifier: coordinateSystem.id
    });
    const otherProbe = makeProbe({
      id: "B",
      coordinateSystemIdentifier: coordinateSystem.id
    });
    addProbe(experiment, probe);
    addProbe(experiment, otherProbe);

    removeProbe(experiment, probe);

    expect(experiment.coordinateSystems).toEqual({
      [coordinateSystem.id]: coordinateSystem
    });
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
    const experiment = makeExperiment({ name: "Exp" });
    const [a, b, c] = makeThreeProbes(experiment);

    reorderProbe(experiment, 0, 2);

    expect(experiment.probes).toEqual([b, c, a]);
  });

  it("is a no-op for equal indices", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const probes = makeThreeProbes(experiment);

    reorderProbe(experiment, 1, 1);

    expect(experiment.probes).toEqual(probes);
  });

  it("is a no-op for an out-of-range index", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const probes = makeThreeProbes(experiment);

    reorderProbe(experiment, 0, 3);

    expect(experiment.probes).toEqual(probes);
  });
});

describe("getExperimentModelIds", () => {
  it("returns each scene object's modelId plus each probe body model's modelId", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const sceneObject = makeSceneObject();
    experiment.sceneObjects = [sceneObject];
    const bodyModel = makeSceneModel();
    experiment.probes = [makeProbe({ bodyModel })];

    expect(getExperimentModelIds(experiment)).toEqual([
      sceneObject.modelId,
      bodyModel.modelId
    ]);
  });

  it("returns one entry when two scene objects share a modelId", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const shared = makeSceneObject();
    experiment.sceneObjects = [
      shared,
      makeSceneObject({ modelId: shared.modelId })
    ];

    expect(getExperimentModelIds(experiment)).toEqual([shared.modelId]);
  });

  it("returns an empty array for an experiment with no scene objects and no body models", () => {
    const experiment = makeExperiment({ name: "Exp" });

    expect(getExperimentModelIds(experiment)).toEqual([]);
  });
});

describe("addCameraPose", () => {
  it("adds the pose to the experiment", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const pose = copyCameraPose(makeCameraPose({ alpha: 1 }), "Dorsal");

    addCameraPose(experiment, pose);

    expect(experiment.cameraPoses).toEqual([pose]);
  });

  it("does nothing when a pose with the same id already exists", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const pose = {
      ...copyCameraPose(makeCameraPose({ alpha: 1 }), "Dorsal"),
      id: "dup"
    };
    addCameraPose(experiment, pose);

    addCameraPose(experiment, { ...pose, name: "Other" });

    expect(experiment.cameraPoses).toHaveLength(1);
    expect(experiment.cameraPoses[0]!.name).toBe(pose.name);
  });
});

describe("removeCameraPose", () => {
  it("removes the pose from the experiment", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const pose = copyCameraPose(makeCameraPose({ alpha: 1 }), "Dorsal");
    addCameraPose(experiment, pose);

    removeCameraPose(experiment, pose);

    expect(experiment.cameraPoses).toEqual([]);
  });

  it("is a no-op when the pose's id isn't in the experiment", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const kept = copyCameraPose(makeCameraPose({ alpha: 1 }), "Dorsal");
    addCameraPose(experiment, kept);

    removeCameraPose(experiment, { ...kept, id: "never-added" });

    expect(experiment.cameraPoses).toEqual([kept]);
  });
});

describe("reorderCameraPose", () => {
  function makeThreePoses(experiment: Experiment) {
    const a = copyCameraPose(makeCameraPose({ alpha: 1 }), "A");
    const b = copyCameraPose(makeCameraPose({ alpha: 2 }), "B");
    const c = copyCameraPose(makeCameraPose({ alpha: 3 }), "C");
    addCameraPose(experiment, a);
    addCameraPose(experiment, b);
    addCameraPose(experiment, c);
    return [a, b, c];
  }

  it("moves a pose to the dropped-on index", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const [a, b, c] = makeThreePoses(experiment);

    reorderCameraPose(experiment, 0, 2);

    expect(experiment.cameraPoses).toEqual([b, c, a]);
  });

  it("is a no-op for equal indices", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const poses = makeThreePoses(experiment);

    reorderCameraPose(experiment, 1, 1);

    expect(experiment.cameraPoses).toEqual(poses);
  });

  it("is a no-op for an out-of-range index", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const poses = makeThreePoses(experiment);

    reorderCameraPose(experiment, 0, 3);

    expect(experiment.cameraPoses).toEqual(poses);
  });
});

describe("setExperimentProperties", () => {
  it("writes the trimmed name and atlas onto the same experiment object", () => {
    const experiment = makeExperiment({ name: "Old" });
    const atlas = makeAtlas({ name: "allen_human" });

    setExperimentProperties(experiment, {
      name: "  New Name  ",
      atlas,
      defaultStructureIdentifiers: []
    });

    expect(experiment.name).toBe("New Name");
    expect(experiment.atlas).toEqual(atlas);
  });

  it("does not alias the caller's atlas", () => {
    const experiment = makeExperiment({ name: "Old" });
    const atlas = makeAtlas({ name: "allen_human" });

    setExperimentProperties(experiment, {
      name: "New",
      atlas,
      defaultStructureIdentifiers: []
    });
    atlas.source = "https://other.test";

    expect(experiment.atlas.source).toBe(makeAtlas().source);
  });

  it("re-seeds visibleStructures when the atlas name differs", () => {
    const experiment = makeExperiment({ name: "Old" });
    experiment.visibleStructures = [
      { id: 1, isTransparent: false },
      { id: 2, isTransparent: false },
      { id: 3, isTransparent: false }
    ];

    setExperimentProperties(experiment, {
      name: "New",
      atlas: makeAtlas({ name: "allen_human" }),
      defaultStructureIdentifiers: [4, 5]
    });

    expect(experiment.visibleStructures).toEqual([
      { id: 4, isTransparent: true },
      { id: 5, isTransparent: true }
    ]);
  });

  it("re-seeds visibleStructures when only the source differs", () => {
    const experiment = makeExperiment({ name: "Old" });
    experiment.visibleStructures = [
      { id: 1, isTransparent: false },
      { id: 2, isTransparent: false },
      { id: 3, isTransparent: false }
    ];

    setExperimentProperties(experiment, {
      name: "New",
      atlas: makeAtlas({ source: "https://other.test" }),
      defaultStructureIdentifiers: [4, 5]
    });

    expect(experiment.visibleStructures).toEqual([
      { id: 4, isTransparent: true },
      { id: 5, isTransparent: true }
    ]);
  });

  it("keeps visibleStructures when a structurally equal but distinct atlas object is passed", () => {
    const experiment = makeExperiment({ name: "Old" });
    experiment.visibleStructures = [
      { id: 1, isTransparent: false },
      { id: 2, isTransparent: false },
      { id: 3, isTransparent: false }
    ];

    setExperimentProperties(experiment, {
      name: "New",
      atlas: makeAtlas(),
      defaultStructureIdentifiers: [4, 5]
    });

    expect(experiment.visibleStructures).toEqual([
      { id: 1, isTransparent: false },
      { id: 2, isTransparent: false },
      { id: 3, isTransparent: false }
    ]);
  });

  it("re-seeds the reference coordinate from the new atlas, in the experiment's coordinate system", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const newAtlas = makeAtlas({
      name: "allen_human",
      manifest: makeManifest({ bregma: [1, 2, 3] })
    });

    setExperimentProperties(experiment, {
      name: experiment.name,
      atlas: newAtlas,
      defaultStructureIdentifiers: []
    });

    // The new atlas's bregma is [1, 2, 3] along its own ap, si, ml axes. The
    // default right-anterior-superior system reads them as ml, ap, si, and
    // negates the two that run away from anterior and superior.
    expect(experiment.referenceCoordinate).toEqual([3, -1, -2]);
  });

  it("keeps the reference coordinate when the atlas is unchanged", () => {
    const experiment = makeExperiment({
      name: "Exp",
      referenceCoordinate: [1, 2, 3]
    });

    setExperimentProperties(experiment, {
      name: "New",
      atlas: makeAtlas(),
      defaultStructureIdentifiers: []
    });

    expect(experiment.referenceCoordinate).toEqual([1, 2, 3]);
  });

  it("re-frames the live camera's zoom on an atlas change and leaves saved poses alone", () => {
    const oldAtlas = makeAtlas();
    const experiment = makeExperiment({ name: "Exp", atlas: oldAtlas });
    experiment.cameraPose.alpha = 1;
    experiment.cameraPose.beta = 2;
    const originalTarget: [number, number, number] = [
      ...experiment.cameraPose.target
    ];
    const savedPose = copyCameraPose(makeCameraPose(), "Saved");
    addCameraPose(experiment, savedPose);
    const originalSavedTarget: [number, number, number] = [...savedPose.target];
    const originalSavedRadius = savedPose.radius;
    const newAtlas = makeAtlas({
      name: "allen_human",
      manifest: makeManifest({ shape: [[1000, 320, 456]] })
    });

    setExperimentProperties(experiment, {
      name: "New",
      atlas: newAtlas,
      defaultStructureIdentifiers: []
    });

    // The centre moved 5.9 mm along the atlas's own anterior-to-posterior
    // axis, which is the negated posterior-to-anterior axis of the
    // experiment's default coordinate system.
    expect(experiment.cameraPose.radius).toBe(
      getAtlasFramingRadiusMillimeters(newAtlas)
    );
    expect(experiment.cameraPose.alpha).toBe(1);
    expect(experiment.cameraPose.beta).toBe(2);
    expect(experiment.cameraPose.target[0]).toBeCloseTo(originalTarget[0]);
    expect(experiment.cameraPose.target[1]).toBeCloseTo(
      originalTarget[1] - 5.9
    );
    expect(experiment.cameraPose.target[2]).toBeCloseTo(originalTarget[2]);
    expect(savedPose.target).toEqual(originalSavedTarget);
    expect(savedPose.radius).toBe(originalSavedRadius);
  });

  it("shifts every probe tip and scene-object position by the atlas center delta, in the experiment's coordinate system", () => {
    const atlas = makeAtlas();
    const experiment = makeExperiment({ name: "Exp", atlas });
    const probe = buildProbe(
      makeProbeInterfaceProbe(),
      [2, 0, 0],
      experiment.globalCoordinateSystem,
      experiment.localCoordinateSystem
    );
    addProbe(experiment, probe);
    const sceneObject = makeSceneObject({ position: [1, 1, 1] });
    addSceneObject(experiment, sceneObject);
    const newAtlas = makeAtlas({
      name: "allen_human",
      manifest: makeManifest({ shape: [[1000, 320, 456]] })
    });

    setExperimentProperties(experiment, {
      name: experiment.name,
      atlas: newAtlas,
      defaultStructureIdentifiers: []
    });

    expect(probe.tipPosition[0]).toBeCloseTo(2);
    expect(probe.tipPosition[1]).toBeCloseTo(-5.9);
    expect(probe.tipPosition[2]).toBeCloseTo(0);
    expect(sceneObject.position[0]).toBeCloseTo(1);
    expect(sceneObject.position[1]).toBeCloseTo(-4.9);
    expect(sceneObject.position[2]).toBeCloseTo(1);
  });

  it("leaves probe tips, scene-object positions, and the camera target byte-identical on a name-only change", () => {
    const atlas = makeAtlas();
    const experiment = makeExperiment({ name: "Exp", atlas });
    const probe = buildProbe(
      makeProbeInterfaceProbe(),
      [2, 0, 0],
      experiment.globalCoordinateSystem,
      experiment.localCoordinateSystem
    );
    addProbe(experiment, probe);
    const sceneObject = makeSceneObject({ position: [1, 1, 1] });
    addSceneObject(experiment, sceneObject);
    const originalTarget: [number, number, number] = [
      ...experiment.cameraPose.target
    ];

    setExperimentProperties(experiment, {
      name: "Renamed",
      atlas,
      defaultStructureIdentifiers: []
    });

    expect(probe.tipPosition).toEqual([2, 0, 0]);
    expect(sceneObject.position).toEqual([1, 1, 1]);
    expect(experiment.cameraPose.target).toEqual(originalTarget);
  });
});

/** Coordinate system whose axes are the atlas's own, as `ATLAS_AXIS_DIRECTIONS` declares them. */
function buildAtlasAlignedCoordinateSystem(): GlobalCoordinateSystem {
  return {
    ...buildDefaultGlobalCoordinateSystem(),
    axes: [
      buildCoordinateAxis(ATLAS_AXIS_DIRECTIONS[0]),
      buildCoordinateAxis(ATLAS_AXIS_DIRECTIONS[1]),
      buildCoordinateAxis(ATLAS_AXIS_DIRECTIONS[2])
    ]
  };
}

describe("setExperimentGlobalCoordinateSystem", () => {
  it("re-expresses the reference coordinate, probe tips, scene objects, and camera targets", () => {
    const experiment = makeExperiment({
      name: "Exp",
      referenceCoordinate: [1, 2, 3]
    });
    const probe = makeProbe({ tipPosition: [1, 2, 3] });
    addProbe(experiment, probe);
    const sceneObject = makeSceneObject({ position: [1, 2, 3] });
    addSceneObject(experiment, sceneObject);
    const savedPose = copyCameraPose(
      makeCameraPose({ target: [1, 2, 3] }),
      "S"
    );
    addCameraPose(experiment, savedPose);

    setExperimentGlobalCoordinateSystem(
      experiment,
      buildAtlasAlignedCoordinateSystem()
    );

    // Right-anterior-superior [1, 2, 3] read along the atlas's ap, si, ml
    // axes: 2 mm anterior is -2 mm along anterior-to-posterior, 3 mm superior
    // is -3 mm along superior-to-inferior, and 1 mm right is +1 mm along
    // left-to-right.
    expect(experiment.referenceCoordinate).toEqual([-2, -3, 1]);
    expect(probe.tipPosition).toEqual([-2, -3, 1]);
    expect(sceneObject.position).toEqual([-2, -3, 1]);
    expect(savedPose.target).toEqual([-2, -3, 1]);
  });

  it("leaves every coordinate in the same physical place, converting back", () => {
    const experiment = makeExperiment({
      name: "Exp",
      referenceCoordinate: [1, -2, 3]
    });
    const probe = makeProbe({ tipPosition: [4, 5, -6] });
    addProbe(experiment, probe);
    const sceneObject = makeSceneObject({
      position: [-7, 8, 9],
      scale: [1, 2, 3]
    });
    addSceneObject(experiment, sceneObject);
    const from = getAxisDirections(experiment.globalCoordinateSystem);
    const liveTarget: [number, number, number] = [
      ...experiment.cameraPose.target
    ];

    setExperimentGlobalCoordinateSystem(
      experiment,
      buildAtlasAlignedCoordinateSystem()
    );
    const to = getAxisDirections(experiment.globalCoordinateSystem);

    expect(convertCoordinate(to, from, experiment.referenceCoordinate)).toEqual(
      [1, -2, 3]
    );
    expect(convertCoordinate(to, from, probe.tipPosition)).toEqual([4, 5, -6]);
    expect(convertCoordinate(to, from, sceneObject.position)).toEqual([
      -7, 8, 9
    ]);
    expect(convertCoordinate(to, from, experiment.cameraPose.target)).toEqual(
      liveTarget
    );
    expect(sceneObject.scale).toEqual([2, 3, 1]);
  });

  it("keeps every probe pointing the same way", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const probe = makeProbe({ rotation: [0.1, 0.2, 0.3] });
    addProbe(experiment, probe);
    const orientation = getRotationMatrix(
      getAxisDirections(experiment.globalCoordinateSystem),
      [0.1, 0.2, 0.3]
    );

    setExperimentGlobalCoordinateSystem(
      experiment,
      buildAtlasAlignedCoordinateSystem()
    );

    expect(probe.rotation).not.toEqual([0.1, 0.2, 0.3]);
    const rotated = getRotationMatrix(
      getAxisDirections(experiment.globalCoordinateSystem),
      probe.rotation
    );
    for (const [index, value] of orientation.entries()) {
      expect(rotated[index]).toBeCloseTo(value);
    }
  });

  it("adopts the new system", () => {
    const experiment = makeExperiment({ name: "Exp" });
    const system = buildAtlasAlignedCoordinateSystem();

    setExperimentGlobalCoordinateSystem(experiment, system);

    expect(experiment.globalCoordinateSystem).toEqual(system);
    expect(getAxisDirections(experiment.globalCoordinateSystem)).toEqual(
      ATLAS_AXIS_DIRECTIONS
    );
  });
});

describe("setExperimentLocalCoordinateSystem", () => {
  it("adopts the new system without touching any stored coordinate", () => {
    const experiment = makeExperiment({
      name: "Exp",
      referenceCoordinate: [1, 2, 3]
    });
    const probe = makeProbe({ tipPosition: [1, 2, 3], rotation: [4, 5, 6] });
    addProbe(experiment, probe);
    const sceneObject = makeSceneObject({ position: [7, 8, 9] });
    addSceneObject(experiment, sceneObject);
    const target: [number, number, number] = [...experiment.cameraPose.target];
    const system = {
      depthDirection: "Superior_to_inferior",
      forwardDirection: "Posterior_to_anterior"
    } as const;

    setExperimentLocalCoordinateSystem(experiment, system);

    expect(experiment.localCoordinateSystem).toEqual(system);
    expect(experiment.referenceCoordinate).toEqual([1, 2, 3]);
    expect(probe.tipPosition).toEqual([1, 2, 3]);
    expect(probe.rotation).toEqual([4, 5, 6]);
    expect(sceneObject.position).toEqual([7, 8, 9]);
    expect(experiment.cameraPose.target).toEqual(target);
  });
});
