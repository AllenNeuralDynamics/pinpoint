import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import Papa from "papaparse";
import { Color3 } from "@babylonjs/core";
import {
  BRAINGLOBE_BASE_URL,
  getAnnotationVolumeUrl,
  getAtlasCenter,
  getAtlasDimensionsMillimeters,
  getAtlasLongestDimensionMillimeters,
  getManifest,
  getTerminologyRows,
  isSameAtlas,
  listAtlases,
  listAtlasesHTTP,
  structureEntitiesFromIdentifiers
} from "./source.api";
import { makeAtlas, makeManifest, makeTerminologyRows } from "@/test/fixtures";

vi.mock("axios");

// getTerminologyRows delegates the actual network fetch to PapaParse's
// `download: true` mode, so there's no axios/fetch call to mock here -
// mock Papa.parse itself and drive its `complete`/`error` callbacks
// directly.
vi.mock("papaparse", () => ({ default: { parse: vi.fn() } }));

// Throughout this file, axios.get is only ever passed to vi.mocked() to
// retrieve its mock, never called unbound.

describe("listAtlases", () => {
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("requests the S3 atlases listing URL", async () => {
    mockedGet.mockResolvedValue({
      data: `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></ListBucketResult>`
    });

    await listAtlases();

    expect(mockedGet).toHaveBeenCalledWith(
      "https://brainglobe.s3.us-west-2.amazonaws.com/?list-type=2&prefix=atlas-rc2%2Fatlases%2F&delimiter=%2F",
      { responseType: "text" }
    );
  });

  it("returns atlases with the resolution suffix removed from their names", async () => {
    mockedGet.mockResolvedValue({
      data: `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_25um/</Prefix></CommonPrefixes>
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_human_500um/</Prefix></CommonPrefixes>
</ListBucketResult>`
    });

    const result = await listAtlases();

    expect(result).toEqual([
      { name: "allen_mouse", source: BRAINGLOBE_BASE_URL },
      { name: "allen_human", source: BRAINGLOBE_BASE_URL }
    ]);
  });

  it("collapses multiple size variants of the same atlas into one entry", async () => {
    mockedGet.mockResolvedValue({
      data: `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_10um/</Prefix></CommonPrefixes>
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_25um/</Prefix></CommonPrefixes>
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_50um/</Prefix></CommonPrefixes>
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_bluebrain_barrels_10um/</Prefix></CommonPrefixes>
</ListBucketResult>`
    });

    const result = await listAtlases();

    expect(result).toEqual([
      { name: "allen_mouse", source: BRAINGLOBE_BASE_URL },
      { name: "allen_mouse_bluebrain_barrels", source: BRAINGLOBE_BASE_URL }
    ]);
  });

  it("returns null when the request throws", async () => {
    mockedGet.mockRejectedValue(new Error("network error"));

    const result = await listAtlases();

    expect(result).toBeNull();
  });
});

describe("listAtlasesHTTP", () => {
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("requests the atlases directory on the given host", async () => {
    mockedGet.mockResolvedValue({ data: { files: [] } });

    await listAtlasesHTTP("http://localhost:3000");

    expect(mockedGet).toHaveBeenCalledWith(
      "http://localhost:3000/brainglobe-atlasapi/atlases"
    );
  });

  it("keeps only folder entries and strips the resolution suffix", async () => {
    mockedGet.mockResolvedValue({
      data: {
        files: [
          { name: "allen_mouse_25um", type: "folder" },
          { name: "readme.txt", type: "file" },
          { name: "allen_human_500um", type: "folder" }
        ]
      }
    });

    const result = await listAtlasesHTTP("http://localhost:3000");

    expect(result).toEqual([
      { name: "allen_mouse", source: "http://localhost:3000" },
      { name: "allen_human", source: "http://localhost:3000" }
    ]);
  });

  it("collapses multiple size variants of the same atlas into one entry", async () => {
    mockedGet.mockResolvedValue({
      data: {
        files: [
          { name: "allen_mouse_10um", type: "folder" },
          { name: "allen_mouse_25um", type: "folder" },
          { name: "allen_mouse_bluebrain_barrels_10um", type: "folder" }
        ]
      }
    });

    const result = await listAtlasesHTTP("http://localhost:3000");

    expect(result).toEqual([
      { name: "allen_mouse", source: "http://localhost:3000" },
      { name: "allen_mouse_bluebrain_barrels", source: "http://localhost:3000" }
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

  it("requests the terminology CSV URL from the manifest's location on an HTTP host", async () => {
    const promise = getTerminologyRows(makeManifest());
    config().complete({ data: [], errors: [] });
    await promise;

    expect(mockedParse).toHaveBeenCalledWith(
      "http://localhost:3000/brainglobe-atlasapi/terminologies/allen_mouse-terminology/3_0/terminology.csv",
      expect.objectContaining({ download: true, header: true })
    );
  });

  it("requests the terminology CSV URL from the manifest's location on the BrainGlobe bucket", async () => {
    const promise = getTerminologyRows(
      makeManifest({ atlas: makeAtlas({ source: BRAINGLOBE_BASE_URL }) })
    );
    config().complete({ data: [], errors: [] });
    await promise;

    expect(mockedParse).toHaveBeenCalledWith(
      `${BRAINGLOBE_BASE_URL}terminologies/allen_mouse-terminology/3_0/terminology.csv`,
      expect.objectContaining({ download: true, header: true })
    );
  });

  it("uses the manifest's own version rather than a hardcoded one", async () => {
    const promise = getTerminologyRows(
      makeManifest({
        terminologyLocation: "/terminologies/allen-adult-human-terminology/2016"
      })
    );
    config().complete({ data: [], errors: [] });
    await promise;

    expect(mockedParse).toHaveBeenCalledWith(
      "http://localhost:3000/brainglobe-atlasapi/terminologies/allen-adult-human-terminology/2016/terminology.csv",
      expect.objectContaining({ download: true, header: true })
    );
  });

  it("converts identifier/annotation_value to numbers and blank parent_identifier to null", async () => {
    const promise = getTerminologyRows(makeManifest());
    config().complete({
      data: [
        {
          identifier: "997",
          parent_identifier: "",
          annotation_value: "997",
          name: "root",
          abbreviation: "root",
          color_hex_triplet: "#FFFFFF"
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
    const promise = getTerminologyRows(makeManifest());
    config().complete({
      data: [
        {
          identifier: "1",
          parent_identifier: "",
          annotation_value: "1",
          name: "root",
          abbreviation: "123",
          color_hex_triplet: "456"
        }
      ],
      errors: []
    });

    const result = await promise;

    expect(result[0]!.abbreviation).toBe("123");
    expect(result[0]!.color_hex_triplet).toBe("456");
  });

  it("resolves an empty list when results.errors is non-empty", async () => {
    const promise = getTerminologyRows(makeManifest());
    config().complete({ data: [{ identifier: "1" }], errors: [{}] });

    expect(await promise).toEqual([]);
  });

  it("resolves an empty list when the error callback fires", async () => {
    const promise = getTerminologyRows(makeManifest());
    config().error();

    expect(await promise).toEqual([]);
  });
});

describe("getManifest", () => {
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
          shape: [132, 80, 114],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
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

    it("aggregates the variants' resolutions and shapes, finest first, and carries the atlas and manifest locations", async () => {
      mockBucket(LISTING_XML, {
        [MANIFEST_URL_100]: {
          name: "allen_mouse",
          resolution: [100, 100, 100],
          shape: [132, 80, 114],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        }
      });

      const result = await getManifest(s3Atlas);

      expect(result).toEqual({
        atlas: s3Atlas,
        terminologyLocation: "/terminologies/allen_mouse-terminology/3_0",
        annotationSetLocation: "/annotation-sets/allen_mouse-annotation/3_0",
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

      // allen_human has no matching atlases/ dir in this listing.
      const result = await getManifest(
        makeAtlas({ name: "allen_human", source: BRAINGLOBE_BASE_URL })
      );

      expect(result).toBeNull();
      expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    it("returns null when one of the manifest requests fails", async () => {
      mockBucket(LISTING_XML, {
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        }
      });

      expect(await getManifest(s3Atlas)).toBeNull();
    });

    it("returns null when the finest variant's manifest has no terminology location", async () => {
      mockBucket(LISTING_XML, {
        [MANIFEST_URL_100]: {
          name: "allen_mouse",
          resolution: [100, 100, 100],
          shape: [132, 80, 114],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        }
      });

      expect(await getManifest(s3Atlas)).toBeNull();
    });

    it("returns null when the finest variant's manifest has no annotation set location", async () => {
      mockBucket(LISTING_XML, {
        [MANIFEST_URL_100]: {
          name: "allen_mouse",
          resolution: [100, 100, 100],
          shape: [132, 80, 114],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          }
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
          shape: [132, 80, 114],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
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

    it("aggregates the variants' resolutions and shapes, finest first, and carries the atlas and manifest locations", async () => {
      const atlas = makeAtlas();
      mockHost({
        [MANIFEST_URL_100]: {
          name: "allen_mouse",
          resolution: [100, 100, 100],
          shape: [132, 80, 114],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        },
        [MANIFEST_URL_25]: {
          name: "allen_mouse",
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          terminology: {
            location: "/terminologies/allen_mouse-terminology/3_0"
          },
          annotation_set: {
            location: "/annotation-sets/allen_mouse-annotation/3_0"
          }
        }
      });

      const result = await getManifest(atlas);

      expect(result).toEqual({
        atlas,
        terminologyLocation: "/terminologies/allen_mouse-terminology/3_0",
        annotationSetLocation: "/annotation-sets/allen_mouse-annotation/3_0",
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

describe("getAnnotationVolumeUrl", () => {
  it("builds the volume URL from the manifest's annotation set location on an HTTP host", () => {
    const result = getAnnotationVolumeUrl(makeManifest());

    expect(result).toBe(
      "http://localhost:3000/brainglobe-atlasapi/annotation-sets/allen_mouse-annotation/3_0/annotations_compressed.ome.zarr"
    );
  });

  it("builds the volume URL from the manifest's annotation set location on the BrainGlobe bucket", () => {
    const bucketManifest = makeManifest({
      atlas: makeAtlas({ source: BRAINGLOBE_BASE_URL })
    });

    const result = getAnnotationVolumeUrl(bucketManifest);

    expect(result).toBe(
      `${BRAINGLOBE_BASE_URL}annotation-sets/allen_mouse-annotation/3_0/annotations_compressed.ome.zarr`
    );
  });
});

describe("structureEntitiesFromIdentifiers", () => {
  const manifest = makeManifest();
  const terminologyRows = makeTerminologyRows();

  it("resolves each identifier to its structure entity", () => {
    const result = structureEntitiesFromIdentifiers(
      manifest,
      terminologyRows,
      [8, 567]
    );

    expect(result.map(entity => entity.identifier)).toEqual([8, 567]);
  });

  it("drops identifiers that don't resolve to a row", () => {
    const result = structureEntitiesFromIdentifiers(
      manifest,
      terminologyRows,
      [8, 12345]
    );

    expect(result.map(entity => entity.identifier)).toEqual([8]);
  });

  it("returns an empty list for an empty input", () => {
    expect(
      structureEntitiesFromIdentifiers(manifest, terminologyRows, [])
    ).toEqual([]);
  });

  it("builds the mesh path from the manifest's annotation set location on an HTTP host", () => {
    const result = structureEntitiesFromIdentifiers(
      manifest,
      terminologyRows,
      [8]
    );

    expect(result[0]?.meshPath).toBe(
      "http://localhost:3000/brainglobe-atlasapi/annotation-sets/allen_mouse-annotation/3_0/annotations.precomputed/mesh/8"
    );
  });

  it("builds the mesh path from the manifest's annotation set location on the BrainGlobe bucket", () => {
    const bucketManifest = makeManifest({
      atlas: makeAtlas({ source: BRAINGLOBE_BASE_URL })
    });
    const result = structureEntitiesFromIdentifiers(
      bucketManifest,
      terminologyRows,
      [8]
    );

    expect(result[0]?.meshPath).toBe(
      `${BRAINGLOBE_BASE_URL}annotation-sets/allen_mouse-annotation/3_0/annotations.precomputed/mesh/8`
    );
  });

  it("uses the manifest's own version rather than a hardcoded one", () => {
    const result = structureEntitiesFromIdentifiers(
      makeManifest({
        annotationSetLocation:
          "/annotation-sets/allen-adult-human-annotation/2016"
      }),
      terminologyRows,
      [8]
    );

    expect(result[0]?.meshPath).toBe(
      "http://localhost:3000/brainglobe-atlasapi/annotation-sets/allen-adult-human-annotation/2016/annotations.precomputed/mesh/8"
    );
  });

  it("carries the matched row's identifier through", () => {
    const result = structureEntitiesFromIdentifiers(
      manifest,
      terminologyRows,
      [8]
    );

    expect(result[0]?.identifier).toBe(8);
  });

  it("parses color_hex_triplet into a Color3", () => {
    const result = structureEntitiesFromIdentifiers(
      manifest,
      terminologyRows,
      [8]
    );

    expect(result[0]?.color).toEqual(Color3.FromHexString("#BFDAE3"));
  });
});

describe("getAtlasDimensionsMillimeters", () => {
  it("multiplies resolution by shape per axis", () => {
    const manifest = makeManifest({
      resolutions: [[0.02, 0.04, 0.06]],
      shape: [[100, 200, 300]]
    });

    expect(getAtlasDimensionsMillimeters(manifest)).toEqual([2, 8, 18]);
  });

  it("uses only the finest (first) size variant when several are present", () => {
    const manifest = makeManifest({
      resolutions: [
        [0.02, 0.04, 0.06],
        [0.2, 0.4, 0.6]
      ],
      shape: [
        [100, 200, 300],
        [10, 20, 30]
      ]
    });

    expect(getAtlasDimensionsMillimeters(manifest)).toEqual([2, 8, 18]);
  });

  it("falls back to [0, 0, 0] when the manifest has no resolutions", () => {
    const manifest = makeManifest({
      resolutions: [],
      shape: [[100, 200, 300]]
    });

    expect(getAtlasDimensionsMillimeters(manifest)).toEqual([0, 0, 0]);
  });

  it("falls back to [0, 0, 0] when the manifest has no shape", () => {
    const manifest = makeManifest({
      resolutions: [[0.02, 0.04, 0.06]],
      shape: []
    });

    expect(getAtlasDimensionsMillimeters(manifest)).toEqual([0, 0, 0]);
  });
});

describe("getAtlasCenter", () => {
  it("halves resolution * shape per axis", () => {
    const manifest = makeManifest({
      resolutions: [[0.02, 0.04, 0.06]],
      shape: [[100, 200, 300]]
    });

    expect(getAtlasCenter(manifest)).toEqual([1, 4, 9]);
  });

  it("uses only the finest (first) size variant when several are present", () => {
    const manifest = makeManifest({
      resolutions: [
        [0.02, 0.04, 0.06],
        [0.2, 0.4, 0.6]
      ],
      shape: [
        [100, 200, 300],
        [10, 20, 30]
      ]
    });

    expect(getAtlasCenter(manifest)).toEqual([1, 4, 9]);
  });

  it("falls back to [0, 0, 0] when the manifest has no resolutions", () => {
    const manifest = makeManifest({
      resolutions: [],
      shape: [[100, 200, 300]]
    });

    expect(getAtlasCenter(manifest)).toEqual([0, 0, 0]);
  });

  it("falls back to [0, 0, 0] when the manifest has no shape", () => {
    const manifest = makeManifest({
      resolutions: [[0.02, 0.04, 0.06]],
      shape: []
    });

    expect(getAtlasCenter(manifest)).toEqual([0, 0, 0]);
  });
});

describe("getAtlasLongestDimensionMillimeters", () => {
  it("picks the largest resolution * shape across axes, not just AP", () => {
    const manifest = makeManifest({
      resolutions: [[0.02, 0.04, 0.06]],
      shape: [[100, 200, 300]]
    });

    // AP: 2, DV: 8, ML: 18 - ML is the longest, not the first axis.
    expect(getAtlasLongestDimensionMillimeters(manifest)).toBe(18);
  });

  it("uses only the finest (first) size variant when several are present", () => {
    const manifest = makeManifest({
      resolutions: [
        [0.02, 0.04, 0.06],
        [0.2, 0.4, 0.6]
      ],
      shape: [
        [100, 200, 300],
        [10, 20, 30]
      ]
    });

    expect(getAtlasLongestDimensionMillimeters(manifest)).toBe(18);
  });

  it("falls back to 0 when the manifest has no resolutions", () => {
    const manifest = makeManifest({
      resolutions: [],
      shape: [[100, 200, 300]]
    });

    expect(getAtlasLongestDimensionMillimeters(manifest)).toBe(0);
  });

  it("falls back to 0 when the manifest has no shape", () => {
    const manifest = makeManifest({
      resolutions: [[0.02, 0.04, 0.06]],
      shape: []
    });

    expect(getAtlasLongestDimensionMillimeters(manifest)).toBe(0);
  });
});

describe("isSameAtlas", () => {
  it("returns true for distinct objects with equal name and source", () => {
    const first = makeAtlas({ name: "allen_mouse", source: "https://a.test" });
    const second = makeAtlas({ name: "allen_mouse", source: "https://a.test" });

    expect(isSameAtlas(first, second)).toBe(true);
  });

  it("returns false when name and source both differ", () => {
    const first = makeAtlas({ name: "allen_mouse", source: "https://a.test" });
    const second = makeAtlas({ name: "allen_human", source: "https://b.test" });

    expect(isSameAtlas(first, second)).toBe(false);
  });
});
