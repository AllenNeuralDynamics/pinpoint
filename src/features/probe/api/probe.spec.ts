import { describe, expect, it } from "vitest";
import { isProxy, isReactive, reactive, toRaw } from "vue";
import type { Probe } from "../models/probe.model";
import {
  buildProbe,
  copyProbe,
  detachProbeInterfaceProbe,
  detachProbeInterfaceProbes,
  findProbeInterfaceProbeByIdentifier,
  getManufacturerDisplayName,
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier,
  getProbeModelDisplayName,
  homeProbe,
  isProbe,
  isProbeInterfaceProbe,
  rotateProbeVisibility,
  toggleProbeLock
} from "./probe.api";
import { addProbe, buildExperiment } from "@/features/experiment";
import { makeAtlas, makeProbe, makeProbeInterfaceProbe } from "@/test/fixtures";

describe("buildProbe", () => {
  it("references the given probe identifier", () => {
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    const probe = buildProbe(spec);
    expect(probe.probeInterfaceIdentifier).toBe("imec np1");
  });

  it("builds a probe with sensible defaults, starting pitched inferiorly", () => {
    const probe = buildProbe(makeProbeInterfaceProbe());

    expect(probe.inspectableKind).toBe("probe");
    expect(probe.visibility).toBe("visible");
    expect(probe.lock).toBe(false);
    expect(probe.tipPosition).toEqual([0, 0, 0]);
    // A pitch of 0 would lie flat, pointing anteriorly; PI/2 is the intended
    // starting default so a new probe points inferiorly.
    expect(probe.rotation).toEqual([0, 0, Math.PI / 2]);
    expect(probe.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(probe.name).toMatch(/^Probe /);
    expect(probe.color).toMatch(/^#/);
    // Null, not a fixed mm value - the slice view defaults this
    // proportionally to whichever atlas is current.
    expect(probe.sliceExtentMillimeters).toBeNull();
    expect(probe.sliceCenterHeightMillimeters).toBe(0);
    expect(probe.channelMapWindow).toBeNull();
  });

  it("gives each probe a unique id", () => {
    const a = buildProbe(makeProbeInterfaceProbe());
    const b = buildProbe(makeProbeInterfaceProbe());
    expect(a.id).not.toBe(b.id);
  });
});

describe("getProbeIdentifier", () => {
  it("returns the manufacturer and model name", () => {
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    expect(getProbeInterfaceIdentifier(spec)).toBe("imec np1");
  });

  it("returns the same identifier for definitions differing only in geometry", () => {
    const a = makeProbeInterfaceProbe({ si_units: "um" });
    const b = makeProbeInterfaceProbe({ si_units: "mm" });
    expect(getProbeInterfaceIdentifier(a)).toBe(getProbeInterfaceIdentifier(b));
  });
});

describe("detachProbeInterfaceProbe", () => {
  it("returns a structurally equal copy", () => {
    const spec = makeProbeInterfaceProbe();
    const detached = detachProbeInterfaceProbe(spec);
    expect(detached).toEqual(spec);
  });

  it("returns an object independent of the source", () => {
    const spec = makeProbeInterfaceProbe();
    const detached = detachProbeInterfaceProbe(spec);

    expect(detached).not.toBe(spec);
    expect(detached.contact_positions).not.toBe(spec.contact_positions);

    // Mutating the source afterwards must not affect the detached copy, and
    // vice versa -- they must not share nested structure.
    spec.contact_positions.push([9, 9]);
    expect(detached.contact_positions).toEqual([[0, 0]]);
  });

  it("opts the returned object out of Vue's reactivity", () => {
    const detached = detachProbeInterfaceProbe(makeProbeInterfaceProbe());
    const holder = reactive({ spec: detached });

    expect(isReactive(holder.spec)).toBe(false);
  });

  it("accepts a reactive proxy without throwing, and does not mark the source raw", () => {
    const source = reactive(makeProbeInterfaceProbe());

    const detached = detachProbeInterfaceProbe(source);

    expect(detached).toEqual(toRaw(source));
    // The source (e.g. a probe library entry) must remain reactive: marking
    // it raw would be a side effect on shared state well beyond this call.
    expect(isReactive(source)).toBe(true);
    expect(isProxy(source)).toBe(true);
  });
});

describe("rotateProbeVisibility", () => {
  it("cycles visible -> shanks -> hidden -> visible", () => {
    const probe = makeProbe({ visibility: "visible" });

    rotateProbeVisibility(probe);
    expect(probe.visibility).toBe("shanks");

    rotateProbeVisibility(probe);
    expect(probe.visibility).toBe("hidden");

    rotateProbeVisibility(probe);
    expect(probe.visibility).toBe("visible");
  });

  it("falls back to hidden for an unrecognized visibility value", () => {
    const probe = makeProbe({
      visibility: "unknown" as unknown as Probe["visibility"]
    });

    rotateProbeVisibility(probe);

    expect(probe.visibility).toBe("hidden");
  });
});

describe("homeProbe", () => {
  it("resets the experiment entry's tip position to the atlas origin, leaving rotation untouched", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const probe = makeProbe({
      tipPosition: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3]
    });
    addProbe(experiment, probe);

    homeProbe(experiment, probe);

    expect(experiment.probes[0]!.tipPosition).toEqual([0, 0, 0]);
    expect(experiment.probes[0]!.rotation).toEqual([0.1, 0.2, 0.3]);
  });

  it("does nothing when the probe isn't in the experiment", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const probe = makeProbe({ tipPosition: [1, 2, 3] });

    homeProbe(experiment, probe);

    expect(probe.tipPosition).toEqual([1, 2, 3]);
  });
});

describe("copyProbe", () => {
  it("inserts a copy directly after the source, with a fresh id and a copy-suffixed name", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const first = makeProbe({ name: "A" });
    const second = makeProbe({ name: "B" });
    addProbe(experiment, first);
    addProbe(experiment, second);

    const copy = copyProbe(experiment, first);

    expect(experiment.probes).toHaveLength(3);
    expect(experiment.probes[1]).toBe(copy);
    expect(copy!.id).not.toBe(first.id);
    expect(copy!.name).toBe("A - copy");
    expect(copy).toEqual({ ...first, id: copy!.id, name: copy!.name });
  });

  it("copies a locked source as locked", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const probe = makeProbe({ lock: true });
    addProbe(experiment, probe);

    const copy = copyProbe(experiment, probe);

    expect(copy!.lock).toBe(true);
  });

  it("deep-copies mutable fields, independent of the source", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const probe = makeProbe({ tipPosition: [1, 2, 3] });
    addProbe(experiment, probe);

    const copy = copyProbe(experiment, probe)!;
    copy.tipPosition[0] = 99;

    expect(probe.tipPosition[0]).toBe(1);
  });

  it("returns null and leaves the experiment untouched when the probe isn't there", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const probe = makeProbe();

    const copy = copyProbe(experiment, probe);

    expect(copy).toBeNull();
    expect(experiment.probes).toEqual([]);
  });
});

describe("toggleProbeLock", () => {
  it("flips lock false -> true -> false", () => {
    const probe = makeProbe({ lock: false });

    toggleProbeLock(probe);
    expect(probe.lock).toBe(true);

    toggleProbeLock(probe);
    expect(probe.lock).toBe(false);
  });
});

describe("getProbeInterfaceDisplayName", () => {
  it("combines the known manufacturer name and known model description", () => {
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "NP1000" }
    });
    expect(getProbeInterfaceDisplayName(spec)).toBe(
      "IMEC Neuropixels 1.0 probe (NP1000)"
    );
  });

  it("trims a known description with trailing whitespace", () => {
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "NP1014" }
    });
    expect(getProbeInterfaceDisplayName(spec)).not.toMatch(/\s$/);
  });

  it("falls back to the raw model name for a known manufacturer", () => {
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "cambridgeneurotech", model_name: "ASSY-1" }
    });
    expect(getProbeInterfaceDisplayName(spec)).toBe(
      "Cambridge NeuroTech ASSY-1"
    );
  });

  it("falls back to the raw manufacturer and model name when both are unknown", () => {
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "acme", model_name: "widget-9" }
    });
    expect(getProbeInterfaceDisplayName(spec)).toBe("acme widget-9");
  });
});

describe("getManufacturerDisplayName", () => {
  it("returns the proper noun for a known manufacturer", () => {
    expect(getManufacturerDisplayName("cambridgeneurotech")).toBe(
      "Cambridge NeuroTech"
    );
  });

  it("falls back to the raw name for an unknown manufacturer", () => {
    expect(getManufacturerDisplayName("acme")).toBe("acme");
  });
});

describe("getProbeModelDisplayName", () => {
  it("returns the known description for a recognized model", () => {
    expect(getProbeModelDisplayName("imec", "NP2013")).toBe(
      "Neuropixels 2.0 multishank probe"
    );
  });

  it("trims a known description with trailing whitespace", () => {
    expect(getProbeModelDisplayName("imec", "NP1014")).not.toMatch(/\s$/);
  });

  it("falls back to the raw model name for an unrecognized model", () => {
    expect(getProbeModelDisplayName("imec", "nope")).toBe("nope");
  });
});

describe("detachProbeInterfaceProbes", () => {
  it("detaches every entry from reactivity in place", () => {
    const specA = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    const specB = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np2" }
    });
    const record = reactive({ a: specA, b: specB });

    detachProbeInterfaceProbes(record);

    expect(isReactive(record.a)).toBe(false);
    expect(isReactive(record.b)).toBe(false);
    expect(toRaw(record.a)).toEqual(specA);
    expect(toRaw(record.b)).toEqual(specB);
  });

  it("replaces each entry with a fresh reference", () => {
    const spec = makeProbeInterfaceProbe();
    const record: Record<string, typeof spec> = { a: spec };

    detachProbeInterfaceProbes(record);

    expect(record.a).not.toBe(spec);
  });
});

describe("isProbeInterfaceProbe", () => {
  it("accepts a well-formed probe interface definition", () => {
    expect(isProbeInterfaceProbe(makeProbeInterfaceProbe())).toBe(true);
  });

  it("rejects null", () => {
    expect(isProbeInterfaceProbe(null)).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isProbeInterfaceProbe("not an object")).toBe(false);
  });

  it("rejects a definition missing ndim", () => {
    const { ndim: _ndim, ...spec } = makeProbeInterfaceProbe();
    expect(isProbeInterfaceProbe(spec)).toBe(false);
  });

  it("rejects a definition missing si_units", () => {
    const { si_units: _si_units, ...spec } = makeProbeInterfaceProbe();
    expect(isProbeInterfaceProbe(spec)).toBe(false);
  });

  it("rejects a definition missing contact_positions", () => {
    const { contact_positions: _contactPositions, ...spec } =
      makeProbeInterfaceProbe();
    expect(isProbeInterfaceProbe(spec)).toBe(false);
  });

  it("rejects a definition missing annotations", () => {
    const { annotations: _annotations, ...spec } = makeProbeInterfaceProbe();
    expect(isProbeInterfaceProbe(spec)).toBe(false);
  });

  it("rejects a definition missing model_name from annotations", () => {
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec" }
    });
    expect(isProbeInterfaceProbe(spec)).toBe(false);
  });

  it("rejects a definition missing manufacturer from annotations", () => {
    const spec = makeProbeInterfaceProbe({
      annotations: { model_name: "np1" }
    });
    expect(isProbeInterfaceProbe(spec)).toBe(false);
  });
});

describe("isProbe", () => {
  it("accepts a well-formed probe", () => {
    expect(isProbe(makeProbe())).toBe(true);
  });

  it("rejects null", () => {
    expect(isProbe(null)).toBe(false);
  });

  it("rejects a probe with the wrong inspectableKind", () => {
    expect(isProbe({ ...makeProbe(), inspectableKind: "atlas" })).toBe(false);
  });

  it("rejects a probe with an empty id", () => {
    expect(isProbe({ ...makeProbe(), id: "" })).toBe(false);
  });

  it("rejects a probe with an invalid color", () => {
    expect(isProbe({ ...makeProbe(), color: "red" })).toBe(false);
  });

  it("rejects a probe with an unknown visibility", () => {
    expect(isProbe({ ...makeProbe(), visibility: "invisible" })).toBe(false);
  });

  it("rejects a probe with a non-boolean lock", () => {
    expect(isProbe({ ...makeProbe(), lock: "yes" })).toBe(false);
  });

  it("rejects a probe missing lock", () => {
    const probe = makeProbe();
    delete (probe as Partial<Probe>).lock;
    expect(isProbe(probe)).toBe(false);
  });

  it("rejects a probe with a short tipPosition", () => {
    expect(isProbe({ ...makeProbe(), tipPosition: [0, 0] })).toBe(false);
  });

  it("rejects a probe with a non-finite rotation component", () => {
    expect(isProbe({ ...makeProbe(), rotation: [0, 0, NaN] })).toBe(false);
  });

  it("accepts a probe with a null sliceExtentMillimeters", () => {
    expect(isProbe(makeProbe({ sliceExtentMillimeters: null }))).toBe(true);
  });

  it("rejects a probe with a non-numeric, non-null sliceExtentMillimeters", () => {
    expect(isProbe({ ...makeProbe(), sliceExtentMillimeters: "8" })).toBe(
      false
    );
  });

  it("rejects a probe missing sliceCenterHeightMillimeters", () => {
    const probe = makeProbe();
    delete (probe as Partial<Probe>).sliceCenterHeightMillimeters;
    expect(isProbe(probe)).toBe(false);
  });

  it("rejects a probe with a non-finite sliceCenterHeightMillimeters", () => {
    expect(isProbe({ ...makeProbe(), sliceCenterHeightMillimeters: NaN })).toBe(
      false
    );
  });

  it("accepts a probe with a null channelMapWindow", () => {
    expect(isProbe(makeProbe({ channelMapWindow: null }))).toBe(true);
  });

  it("accepts a probe with a well-formed channelMapWindow", () => {
    expect(isProbe(makeProbe({ channelMapWindow: { min: 2, max: 6 } }))).toBe(
      true
    );
  });

  it("rejects a probe missing channelMapWindow", () => {
    const probe = makeProbe();
    delete (probe as Partial<Probe>).channelMapWindow;
    expect(isProbe(probe)).toBe(false);
  });

  it("rejects a probe with a non-numeric channelMapWindow bound", () => {
    expect(
      isProbe(
        makeProbe({
          channelMapWindow: { min: "0", max: 1 } as unknown as {
            min: number;
            max: number;
          }
        })
      )
    ).toBe(false);
  });

  it("rejects a probe with an inverted channelMapWindow", () => {
    expect(isProbe(makeProbe({ channelMapWindow: { min: 5, max: 1 } }))).toBe(
      false
    );
  });

  it("rejects a probe with a negative channelMapWindow", () => {
    expect(isProbe(makeProbe({ channelMapWindow: { min: -1, max: 1 } }))).toBe(
      false
    );
  });
});

describe("findProbeInterfaceProbeByIdentifier", () => {
  it("returns the definition matching the identifier", () => {
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });

    expect(
      findProbeInterfaceProbeByIdentifier(
        [spec],
        getProbeInterfaceIdentifier(spec)
      )
    ).toEqual(spec);
  });

  it("returns null when no definition matches", () => {
    expect(
      findProbeInterfaceProbeByIdentifier(
        [makeProbeInterfaceProbe()],
        "missing identifier"
      )
    ).toBeNull();
  });
});
