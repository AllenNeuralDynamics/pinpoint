import { describe, expect, it } from "vitest";
import { isProxy, isReactive, reactive, toRaw } from "vue";
import type { Probe } from "../models/probe.model";
import {
  buildProbe,
  detachProbeInterfaceProbe,
  findProbeInterfaceProbeByIdentifier,
  getManufacturerDisplayName,
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier,
  getProbeModelDisplayName,
  rotateProbeVisibility
} from "./probe.api";
import { makeProbe, makeProbeInterfaceProbe } from "@/test/fixtures";

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
    expect(probe.tipPosition).toEqual([0, 0, 0]);
    // A pitch of 0 would lie flat, pointing anteriorly; PI/2 is the intended
    // starting default so a new probe points inferiorly.
    expect(probe.rotation).toEqual([0, 0, Math.PI / 2]);
    expect(probe.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(probe.name).toMatch(/^Probe /);
    expect(probe.color).toMatch(/^#/);
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
