import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import {
  getManufacturers,
  getProbeInterfaceProbe,
  getProbeNames,
  parseProbeInterfaceFile
} from "./install.api";

// install-probe.api.ts calls `axios.create()` to build dedicated instances
// (githubApi, fileApi), so mocking `axios.get` alone wouldn't reach their
// `.get` calls. Make `create()` return the same mocked `axios` module so its
// `.get` is the one instance under test.
vi.mock("axios", async importOriginal => {
  const actual = await importOriginal<typeof import("axios")>();
  const mocked = { ...actual.default, get: vi.fn() };
  mocked.create = vi.fn().mockReturnValue(mocked);
  return { default: mocked };
});

function makeRawProbeInterfaceProbe(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ndim: 2,
    si_units: "um",
    contact_positions: [[0, 0]],
    annotations: { model_name: "1.0", manufacturer: "IMEC" },
    ...overrides
  };
}

function probeInterfaceFileText(
  probes: Record<string, unknown>[] = [makeRawProbeInterfaceProbe()]
): string {
  return JSON.stringify({
    specification: "probeinterface",
    version: "0.2.24",
    probes
  });
}

describe("getManufacturers", () => {
  // axios.get is only ever passed to vi.mocked() to retrieve its mock, never
  // called unbound.
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("returns the names of top level directories", async () => {
    mockedGet.mockResolvedValue({
      data: [
        { name: "neuropixels", type: "dir" },
        { name: "cambridgeneurotech", type: "dir" }
      ]
    });

    expect(await getManufacturers()).toEqual([
      "neuropixels",
      "cambridgeneurotech"
    ]);
  });

  it("excludes non-directory entries", async () => {
    mockedGet.mockResolvedValue({
      data: [
        { name: "neuropixels", type: "dir" },
        { name: "README.md", type: "file" }
      ]
    });

    expect(await getManufacturers()).toEqual(["neuropixels"]);
  });

  it("excludes dotfile directories", async () => {
    mockedGet.mockResolvedValue({
      data: [
        { name: "neuropixels", type: "dir" },
        { name: ".github", type: "dir" }
      ]
    });

    expect(await getManufacturers()).toEqual(["neuropixels"]);
  });

  it("excludes the apps and scripts directories", async () => {
    mockedGet.mockResolvedValue({
      data: [
        { name: "neuropixels", type: "dir" },
        { name: "apps", type: "dir" },
        { name: "scripts", type: "dir" }
      ]
    });

    expect(await getManufacturers()).toEqual(["neuropixels"]);
  });

  it("returns an empty list when the response is a GitHub 404", async () => {
    mockedGet.mockResolvedValue({ data: { status: "404" } });

    expect(await getManufacturers()).toEqual([]);
  });

  it("returns an empty list when the response has no data", async () => {
    mockedGet.mockResolvedValue({ data: undefined });

    expect(await getManufacturers()).toEqual([]);
  });

  it("returns an empty list when the request throws", async () => {
    mockedGet.mockRejectedValue(new Error("network error"));

    expect(await getManufacturers()).toEqual([]);
  });
});

describe("getProbeNames", () => {
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("returns the names of probe directories for a manufacturer", async () => {
    mockedGet.mockResolvedValue({
      data: [
        { name: "1.0", type: "dir" },
        { name: "2.0", type: "dir" }
      ]
    });

    expect(await getProbeNames("neuropixels")).toEqual(["1.0", "2.0"]);
  });

  it("excludes non-directory entries", async () => {
    mockedGet.mockResolvedValue({
      data: [
        { name: "1.0", type: "dir" },
        { name: "README.md", type: "file" }
      ]
    });

    expect(await getProbeNames("neuropixels")).toEqual(["1.0"]);
  });

  it("returns an empty list when the response is a GitHub 404", async () => {
    mockedGet.mockResolvedValue({ data: { status: "404" } });

    expect(await getProbeNames("neuropixels")).toEqual([]);
  });

  it("returns an empty list when the response has no data", async () => {
    mockedGet.mockResolvedValue({ data: undefined });

    expect(await getProbeNames("neuropixels")).toEqual([]);
  });

  it("returns an empty list when the request throws", async () => {
    mockedGet.mockRejectedValue(new Error("network error"));

    expect(await getProbeNames("neuropixels")).toEqual([]);
  });
});

describe("getProbeInterfaceProbe", () => {
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("returns the first probe from a successful response", async () => {
    const probe = makeRawProbeInterfaceProbe();
    mockedGet.mockResolvedValue({
      data: {
        specification: "probeinterface",
        version: "0.2.24",
        probes: [probe]
      }
    });

    expect(await getProbeInterfaceProbe("neuropixels", "1.0")).toEqual(probe);
  });

  it("returns null when the response has no probes", async () => {
    mockedGet.mockResolvedValue({
      data: { specification: "probeinterface", version: "0.2.24", probes: [] }
    });

    expect(await getProbeInterfaceProbe("neuropixels", "1.0")).toBeNull();
  });

  it("returns null when the request throws", async () => {
    mockedGet.mockRejectedValue(new Error("network error"));

    expect(await getProbeInterfaceProbe("neuropixels", "1.0")).toBeNull();
  });

  it("returns null when the fetched probe is missing annotations", async () => {
    mockedGet.mockResolvedValue({
      data: {
        specification: "probeinterface",
        version: "0.2.24",
        probes: [makeRawProbeInterfaceProbe({ annotations: undefined })]
      }
    });

    expect(await getProbeInterfaceProbe("neuropixels", "1.0")).toBeNull();
  });
});

describe("parseProbeInterfaceFile", () => {
  it("returns the first probe from a valid ProbeInterface file", () => {
    const probe = makeRawProbeInterfaceProbe();

    expect(parseProbeInterfaceFile(probeInterfaceFileText([probe]))).toEqual(
      probe
    );
  });

  it("returns only the first probe when the file has more than one", () => {
    const first = makeRawProbeInterfaceProbe();
    const second = makeRawProbeInterfaceProbe({ ndim: 3, si_units: "mm" });

    expect(
      parseProbeInterfaceFile(probeInterfaceFileText([first, second]))
    ).toEqual(first);
  });

  it("returns null for invalid JSON", () => {
    expect(parseProbeInterfaceFile("not json")).toBeNull();
  });

  it("returns null when parsed JSON isn't an object", () => {
    expect(parseProbeInterfaceFile("42")).toBeNull();
  });

  it("returns null when probes is missing", () => {
    expect(
      parseProbeInterfaceFile(
        JSON.stringify({ specification: "probeinterface", version: "0.2.24" })
      )
    ).toBeNull();
  });

  it("returns null when probes is empty", () => {
    expect(parseProbeInterfaceFile(probeInterfaceFileText([]))).toBeNull();
  });

  it("returns null when the first probe is missing required fields", () => {
    expect(
      parseProbeInterfaceFile(
        probeInterfaceFileText([{ ndim: 2, si_units: "um" }])
      )
    ).toBeNull();
  });

  it("returns null when a required field has the wrong type", () => {
    expect(
      parseProbeInterfaceFile(
        probeInterfaceFileText([makeRawProbeInterfaceProbe({ ndim: "2" })])
      )
    ).toBeNull();
  });

  it("returns null when annotations is missing", () => {
    expect(
      parseProbeInterfaceFile(
        probeInterfaceFileText([
          makeRawProbeInterfaceProbe({ annotations: undefined })
        ])
      )
    ).toBeNull();
  });

  it("returns null when model_name is missing from annotations", () => {
    expect(
      parseProbeInterfaceFile(
        probeInterfaceFileText([
          makeRawProbeInterfaceProbe({ annotations: { manufacturer: "IMEC" } })
        ])
      )
    ).toBeNull();
  });

  it("returns null when manufacturer is missing from annotations", () => {
    expect(
      parseProbeInterfaceFile(
        probeInterfaceFileText([
          makeRawProbeInterfaceProbe({ annotations: { model_name: "1.0" } })
        ])
      )
    ).toBeNull();
  });

  it("returns null when model_name or manufacturer has the wrong type", () => {
    expect(
      parseProbeInterfaceFile(
        probeInterfaceFileText([
          makeRawProbeInterfaceProbe({
            annotations: { model_name: 1, manufacturer: "IMEC" }
          })
        ])
      )
    ).toBeNull();
  });
});
