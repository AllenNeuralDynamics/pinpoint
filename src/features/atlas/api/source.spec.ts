import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import Papa from "papaparse";
import { Color3 } from "@babylonjs/core";
import {
  BRAINGLOBE_BASE_URL,
  getManifest,
  getTerminologyRows,
  listAtlases,
  listAtlasesHTTP,
  structureEntityFromIdentifier
} from "./source.api";
import { makeAtlas, makeTerminologyRows } from "@/test/fixtures";

vi.mock("axios");

// getTerminologyRows delegates the actual network fetch to PapaParse's
// `download: true` mode, so there's no axios/fetch call to mock here -
// mock Papa.parse itself and drive its `complete`/`error` callbacks
// directly.
vi.mock("papaparse", () => ({ default: { parse: vi.fn() } }));

describe("listAtlases", () => {
  // axios.get is only ever passed to vi.mocked() to retrieve its mock, never
  // called unbound.
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("requests the S3 terminology listing URL", async () => {
    mockedGet.mockResolvedValue({
      data: `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></ListBucketResult>`
    });

    await listAtlases();

    expect(mockedGet).toHaveBeenCalledWith(
      "https://brainglobe.s3.us-west-2.amazonaws.com/?list-type=2&prefix=atlas-rc2%2Fterminologies%2F&delimiter=%2F",
      { responseType: "text" }
    );
  });

  it("returns atlases with the terminology suffix removed from their names", async () => {
    mockedGet.mockResolvedValue({
      data: `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CommonPrefixes><Prefix>atlas-rc2/terminologies/allen_mouse-terminology/</Prefix></CommonPrefixes>
  <CommonPrefixes><Prefix>atlas-rc2/terminologies/allen-adult-human-terminology/</Prefix></CommonPrefixes>
</ListBucketResult>`
    });

    const result = await listAtlases();

    expect(result).toEqual([
      { name: "allen_mouse", source: BRAINGLOBE_BASE_URL },
      { name: "allen-adult-human", source: BRAINGLOBE_BASE_URL }
    ]);
  });

  it("returns null when the request throws", async () => {
    mockedGet.mockRejectedValue(new Error("network error"));

    const result = await listAtlases();

    expect(result).toBeNull();
  });
});

describe("listAtlasesHTTP", () => {
  // axios.get is only ever passed to vi.mocked() to retrieve its mock, never
  // called unbound.
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("requests the terminologies directory on the given host", async () => {
    mockedGet.mockResolvedValue({ data: { files: [] } });

    await listAtlasesHTTP("http://localhost:3000");

    expect(mockedGet).toHaveBeenCalledWith(
      "http://localhost:3000/brainglobe-atlasapi/terminologies"
    );
  });

  it("keeps only folder entries and strips the terminology suffix", async () => {
    mockedGet.mockResolvedValue({
      data: {
        files: [
          { name: "allen_mouse-terminology", type: "folder" },
          { name: "readme.txt", type: "file" },
          { name: "allen-adult-human-terminology", type: "folder" }
        ]
      }
    });

    const result = await listAtlasesHTTP("http://localhost:3000");

    expect(result).toEqual([
      { name: "allen_mouse", source: "http://localhost:3000" },
      { name: "allen-adult-human", source: "http://localhost:3000" }
    ]);
  });

  it("returns null when the request throws", async () => {
    mockedGet.mockRejectedValue(new Error("network error"));

    const result = await listAtlasesHTTP("http://localhost:3000");

    expect(result).toBeNull();
  });
});

describe("getTerminologyRows", () => {
  // Papa.parse is only ever passed to vi.mocked() to retrieve its mock,
  // never called unbound.
  // oxlint-disable-next-line typescript/unbound-method
  const mockedParse = vi.mocked(Papa.parse);

  beforeEach(() => {
    mockedParse.mockReset();
  });

  /**
   * Extract the config object passed to the mocked `Papa.parse` call, typed
   * loosely since only `complete`/`error` are exercised here.
   */
  function config() {
    return mockedParse.mock.calls[0]![1] as {
      complete: (results: { data: unknown[]; errors: unknown[] }) => void;
      error: () => void;
    };
  }

  it("requests the terminology CSV URL for the atlas", async () => {
    const promise = getTerminologyRows(
      makeAtlas({ name: "allen_mouse", source: "http://localhost:3000/" })
    );
    config().complete({ data: [], errors: [] });
    await promise;

    expect(mockedParse).toHaveBeenCalledWith(
      "http://localhost:3000/terminologies/allen_mouse-terminology/3_0/terminology.csv",
      expect.objectContaining({ download: true, header: true })
    );
  });

  it("parses a single-element root_identifier_path into an array, not a number", async () => {
    const promise = getTerminologyRows(makeAtlas());
    config().complete({
      data: [
        {
          identifier: "997",
          parent_identifier: "",
          annotation_value: "997",
          name: "root",
          abbreviation: "root",
          color_hex_triplet: "#FFFFFF",
          root_identifier_path: "[997]"
        }
      ],
      errors: []
    });

    const result = await promise;

    expect(result[0]!.root_identifier_path).toEqual([997]);
  });

  it("parses a multi-element root_identifier_path", async () => {
    const promise = getTerminologyRows(makeAtlas());
    config().complete({
      data: [
        {
          identifier: "8",
          parent_identifier: "997",
          annotation_value: "8",
          name: "grey",
          abbreviation: "grey",
          color_hex_triplet: "#BFDAE3",
          root_identifier_path: "[997, 8]"
        }
      ],
      errors: []
    });

    const result = await promise;

    expect(result[0]!.root_identifier_path).toEqual([997, 8]);
  });

  it("converts identifier/annotation_value to numbers and blank parent_identifier to null", async () => {
    const promise = getTerminologyRows(makeAtlas());
    config().complete({
      data: [
        {
          identifier: "997",
          parent_identifier: "",
          annotation_value: "997",
          name: "root",
          abbreviation: "root",
          color_hex_triplet: "#FFFFFF",
          root_identifier_path: "[997]"
        }
      ],
      errors: []
    });

    const result = await promise;

    expect(result[0]!.identifier).toBe(997);
    expect(result[0]!.annotation_value).toBe(997);
    expect(result[0]!.parent_identifier).toBeNull();
  });

  it("keeps numeric-looking abbreviation and color_hex_triplet as strings", async () => {
    const promise = getTerminologyRows(makeAtlas());
    config().complete({
      data: [
        {
          identifier: "1",
          parent_identifier: "",
          annotation_value: "1",
          name: "root",
          abbreviation: "123",
          color_hex_triplet: "456",
          root_identifier_path: "[1]"
        }
      ],
      errors: []
    });

    const result = await promise;

    expect(result[0]!.abbreviation).toBe("123");
    expect(result[0]!.color_hex_triplet).toBe("456");
  });

  it("resolves an empty list when results.errors is non-empty", async () => {
    const promise = getTerminologyRows(makeAtlas());
    config().complete({ data: [{ identifier: "1" }], errors: [{}] });

    expect(await promise).toEqual([]);
  });

  it("resolves an empty list when the error callback fires", async () => {
    const promise = getTerminologyRows(makeAtlas());
    config().error();

    expect(await promise).toEqual([]);
  });

  it("doesn't throw on a malformed root_identifier_path cell", async () => {
    const promise = getTerminologyRows(makeAtlas());
    config().complete({
      data: [
        {
          identifier: "1",
          parent_identifier: "",
          annotation_value: "1",
          name: "root",
          abbreviation: "root",
          color_hex_triplet: "#FFFFFF",
          root_identifier_path: "not json"
        }
      ],
      errors: []
    });

    const result = await promise;

    expect(result[0]!.root_identifier_path).toEqual([]);
  });
});

describe("getManifest", () => {
  // axios.get is only ever passed to vi.mocked() to retrieve its mock, never
  // called unbound.
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  describe("BrainGlobe bucket source", () => {
    const LISTING_URL =
      "https://brainglobe.s3.us-west-2.amazonaws.com/?list-type=2&prefix=atlas-rc2%2Fatlases%2F&delimiter=%2F";
    const MANIFEST_URL_25 = `${BRAINGLOBE_BASE_URL}atlases/allen_mouse_25um/3_0/manifest.json`;
    const MANIFEST_URL_100 = `${BRAINGLOBE_BASE_URL}atlases/allen_mouse_100um/3_0/manifest.json`;

    // Lists two real size variants of allen_mouse, in the lexicographic
    // (i.e. wrong) order S3 returns them in, plus a different atlas that
    // merely shares the prefix.
    const LISTING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_100um/</Prefix></CommonPrefixes>
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_25um/</Prefix></CommonPrefixes>
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_bluebrain_barrels_10um/</Prefix></CommonPrefixes>
</ListBucketResult>`;

    const s3Atlas = makeAtlas({ source: BRAINGLOBE_BASE_URL });

    /**
     * getManifest issues one prefix listing plus one request per size
     * variant, so the mock is keyed on URL instead of resolving a single
     * value. Unknown URLs reject, which also asserts that no extra manifest
     * is fetched.
     */
    function mockBucket(
      listing: string,
      manifests: Record<string, unknown> = {}
    ) {
      mockedGet.mockImplementation((url: string) =>
        url === LISTING_URL
          ? Promise.resolve({ data: listing })
          : url in manifests
            ? Promise.resolve({ data: manifests[url] })
            : Promise.reject(new Error(`unexpected request: ${url}`))
      );
    }

    it("requests the atlases listing and one manifest per size variant", async () => {
      mockBucket(LISTING_XML, {
        [MANIFEST_URL_100]: {
          name: "allen_mouse",
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        }
      });

      await getManifest(s3Atlas);

      expect(mockedGet).toHaveBeenCalledWith(LISTING_URL, {
        responseType: "text"
      });
      expect(mockedGet).toHaveBeenCalledWith(MANIFEST_URL_100);
      expect(mockedGet).toHaveBeenCalledWith(MANIFEST_URL_25);
      // Listing + two variants: the bluebrain_barrels atlas is not fetched.
      expect(mockedGet).toHaveBeenCalledTimes(3);
    });

    it("aggregates the variants' resolutions and shapes, finest first", async () => {
      mockBucket(LISTING_XML, {
        [MANIFEST_URL_100]: {
          name: "allen_mouse",
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        }
      });

      const result = await getManifest(s3Atlas);

      expect(result).toEqual({
        name: "allen_mouse",
        resolutions: [
          [0.025, 0.025, 0.025],
          [0.1, 0.1, 0.1]
        ],
        shape: [
          [528, 320, 456],
          [132, 80, 114]
        ]
      });
    });

    it("returns null when the atlas has no size variant directories", async () => {
      mockBucket(LISTING_XML);

      // allen-adult-human is a terminology name with no matching atlases/
      // dir.
      const result = await getManifest(
        makeAtlas({ name: "allen-adult-human", source: BRAINGLOBE_BASE_URL })
      );

      expect(result).toBeNull();
      expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    it("returns null when one of the manifest requests fails", async () => {
      mockBucket(LISTING_XML, {
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        }
      });

      expect(await getManifest(s3Atlas)).toBeNull();
    });

    it("returns null when the request throws", async () => {
      mockedGet.mockRejectedValue(new Error("network error"));

      const result = await getManifest(s3Atlas);

      expect(result).toBeNull();
    });
  });

  describe("HTTP host source", () => {
    const ATLASES_URL = "http://localhost:3000/brainglobe-atlasapi/atlases";
    const MANIFEST_URL_25 = `${ATLASES_URL}/allen_mouse_25um/3_0/manifest.json`;
    const MANIFEST_URL_100 = `${ATLASES_URL}/allen_mouse_100um/3_0/manifest.json`;

    const LISTING = {
      files: [
        { name: "allen_mouse_100um", type: "folder" },
        { name: "allen_mouse_25um", type: "folder" },
        { name: "allen_mouse_bluebrain_barrels_10um", type: "folder" },
        { name: "last_versions.conf", type: "file" }
      ]
    };

    /** Same URL-keyed routing as the bucket tests, for the JSON listing. */
    function mockHost(manifests: Record<string, unknown> = {}) {
      mockedGet.mockImplementation((url: string) =>
        url === ATLASES_URL
          ? Promise.resolve({ data: LISTING })
          : url in manifests
            ? Promise.resolve({ data: manifests[url] })
            : Promise.reject(new Error(`unexpected request: ${url}`))
      );
    }

    it("requests the atlases directory and one manifest per size variant", async () => {
      mockHost({
        [MANIFEST_URL_100]: {
          name: "allen_mouse",
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        }
      });

      await getManifest(makeAtlas());

      expect(mockedGet).toHaveBeenCalledWith(ATLASES_URL);
      expect(mockedGet).toHaveBeenCalledWith(MANIFEST_URL_100);
      expect(mockedGet).toHaveBeenCalledWith(MANIFEST_URL_25);
      expect(mockedGet).toHaveBeenCalledTimes(3);
    });

    it("never requests the BrainGlobe bucket listing", async () => {
      mockHost();

      await getManifest(makeAtlas());

      expect(mockedGet).not.toHaveBeenCalledWith(
        expect.stringContaining("brainglobe.s3"),
        expect.anything()
      );
    });

    it("aggregates the variants' resolutions and shapes, finest first", async () => {
      mockHost({
        [MANIFEST_URL_100]: {
          name: "allen_mouse",
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        }
      });

      const result = await getManifest(makeAtlas());

      expect(result).toEqual({
        name: "allen_mouse",
        resolutions: [
          [0.025, 0.025, 0.025],
          [0.1, 0.1, 0.1]
        ],
        shape: [
          [528, 320, 456],
          [132, 80, 114]
        ]
      });
    });

    it("returns null when the atlas has no size variant directories", async () => {
      mockHost();

      const result = await getManifest(makeAtlas({ name: "allen_cord" }));

      expect(result).toBeNull();
      expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    it("returns null when the request throws", async () => {
      mockedGet.mockRejectedValue(new Error("network error"));

      const result = await getManifest(makeAtlas());

      expect(result).toBeNull();
    });
  });
});

describe("structureEntityFromIdentifier", () => {
  const atlas = makeAtlas({
    name: "allen_mouse",
    source: "http://localhost:3000/"
  });
  const terminologyRows = makeTerminologyRows();

  it("returns null when no row matches the identifier", () => {
    const result = structureEntityFromIdentifier(atlas, terminologyRows, 12345);

    expect(result).toBeNull();
  });

  it("builds the mesh path from the atlas's annotation set at version 3_0", () => {
    const result = structureEntityFromIdentifier(atlas, terminologyRows, 8);

    expect(result?.meshPath).toBe(
      "http://localhost:3000/annotation-sets/allen_mouse-annotation/3_0/annotations.precomputed/mesh/8"
    );
  });

  it("carries the matched row's identifier through", () => {
    const result = structureEntityFromIdentifier(atlas, terminologyRows, 8);

    expect(result?.identifier).toBe(8);
  });

  it("parses color_hex_triplet into a Color3", () => {
    const result = structureEntityFromIdentifier(atlas, terminologyRows, 8);

    expect(result?.color).toEqual(Color3.FromHexString("#BFDAE3"));
  });
});
