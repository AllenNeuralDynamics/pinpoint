import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import Papa from "papaparse";
import { Color3 } from "@babylonjs/core";
import {
  BRAINGLOBE_BASE_URL,
  getAnnotationVolumeUrl,
  getAtlas,
  getAtlasCenter,
  getAtlasDimensionsMillimeters,
  getAtlasLongestDimensionMillimeters,
  getTerminologyRows,
  isAtlas,
  isSameAtlas,
  listAtlases,
  listAtlasesHTTP,
  structureEntitiesFromIdentifiers
} from "./source.api";
import {
  makeAtlas,
  makeAtlasListing,
  makeManifest,
  makeTerminologyRows
} from "@/test/fixtures";

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

  it("returns one listing per atlas, with the resolution suffix removed from its name and its directory recorded", async () => {
    mockedGet.mockResolvedValue({
      data: `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_25um/</Prefix></CommonPrefixes>
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_human_500um/</Prefix></CommonPrefixes>
</ListBucketResult>`
    });

    const result = await listAtlases();

    expect(result).toEqual([
      {
        name: "allen_mouse",
        source: BRAINGLOBE_BASE_URL,
        variantDirectories: ["allen_mouse_25um"]
      },
      {
        name: "allen_human",
        source: BRAINGLOBE_BASE_URL,
        variantDirectories: ["allen_human_500um"]
      }
    ]);
  });

  it("collapses multiple size variants of the same atlas into one listing carrying every variant directory", async () => {
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
      {
        name: "allen_mouse",
        source: BRAINGLOBE_BASE_URL,
        variantDirectories: [
          "allen_mouse_10um",
          "allen_mouse_25um",
          "allen_mouse_50um"
        ]
      },
      {
        name: "allen_mouse_bluebrain_barrels",
        source: BRAINGLOBE_BASE_URL,
        variantDirectories: ["allen_mouse_bluebrain_barrels_10um"]
      }
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
      {
        name: "allen_mouse",
        source: "http://localhost:3000",
        variantDirectories: ["allen_mouse_25um"]
      },
      {
        name: "allen_human",
        source: "http://localhost:3000",
        variantDirectories: ["allen_human_500um"]
      }
    ]);
  });

  it("collapses multiple size variants of the same atlas into one listing carrying every variant directory", async () => {
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
      {
        name: "allen_mouse",
        source: "http://localhost:3000",
        variantDirectories: ["allen_mouse_10um", "allen_mouse_25um"]
      },
      {
        name: "allen_mouse_bluebrain_barrels",
        source: "http://localhost:3000",
        variantDirectories: ["allen_mouse_bluebrain_barrels_10um"]
      }
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

  it("requests the terminology CSV URL from the atlas's location on an HTTP host", async () => {
    const promise = getTerminologyRows(makeAtlas());
    config().complete({ data: [], errors: [] });
    await promise;

    expect(mockedParse).toHaveBeenCalledWith(
      "http://localhost:3000/brainglobe-atlasapi/terminologies/allen_mouse-terminology/3_0/terminology.csv",
      expect.objectContaining({ download: true, header: true })
    );
  });

  it("requests the terminology CSV URL from the atlas's location on the BrainGlobe bucket", async () => {
    const promise = getTerminologyRows(
      makeAtlas({ source: BRAINGLOBE_BASE_URL })
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
      makeAtlas({
        manifest: makeManifest({
          terminologyLocation:
            "/terminologies/allen-adult-human-terminology/2016"
        })
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
    const promise = getTerminologyRows(makeAtlas());
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
    const promise = getTerminologyRows(makeAtlas());
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
    const promise = getTerminologyRows(makeAtlas());
    config().complete({ data: [{ identifier: "1" }], errors: [{}] });

    expect(await promise).toEqual([]);
  });

  it("resolves an empty list when the error callback fires", async () => {
    const promise = getTerminologyRows(makeAtlas());
    config().error();

    expect(await promise).toEqual([]);
  });
});

/** A raw manifest response body for a given size variant, terminology/annotation locations present. */
function rawManifest(overrides: {
  resolution: [number, number, number];
  shape: [number, number, number];
  atlas_link?: string;
  terminology?: { location: string } | null;
  annotation_set?: { location: string } | null;
}) {
  const { terminology, annotation_set, ...rest } = overrides;
  return {
    name: "allen_mouse",
    ...rest,
    ...(terminology !== null && {
      terminology: terminology ?? {
        location: "/terminologies/allen_mouse-terminology/3_0"
      }
    }),
    ...(annotation_set !== null && {
      annotation_set: annotation_set ?? {
        location: "/annotation-sets/allen_mouse-annotation/3_0"
      }
    })
  };
}

describe("getAtlas", () => {
  // oxlint-disable-next-line typescript/unbound-method
  const mockedGet = vi.mocked(axios.get);

  beforeEach(() => {
    mockedGet.mockReset();
  });

  describe("BrainGlobe bucket source", () => {
    const MANIFEST_URL_25 = `${BRAINGLOBE_BASE_URL}atlases/allen_mouse_25um/3_0/manifest.json`;
    const MANIFEST_URL_100 = `${BRAINGLOBE_BASE_URL}atlases/allen_mouse_100um/3_0/manifest.json`;

    const listing = makeAtlasListing({
      source: BRAINGLOBE_BASE_URL,
      variantDirectories: ["allen_mouse_100um", "allen_mouse_25um"]
    });

    /**
     * `getAtlas` issues one request per size variant and nothing else, so
     * the mock is keyed on URL. Unknown URLs reject, which also asserts
     * that no directory listing or extra manifest is fetched.
     */
    function mockManifests(manifests: Record<string, unknown>) {
      mockedGet.mockImplementation((url: string) =>
        url in manifests
          ? Promise.resolve({ data: manifests[url] })
          : Promise.reject(new Error(`unexpected request: ${url}`))
      );
    }

    it("requests one manifest per variant directory, issuing no directory listing", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        })
      });

      await getAtlas(listing);

      expect(mockedGet).toHaveBeenCalledWith(MANIFEST_URL_100);
      expect(mockedGet).toHaveBeenCalledWith(MANIFEST_URL_25);
      expect(mockedGet).toHaveBeenCalledTimes(2);
    });

    it("aggregates the variants' resolutions and shapes, finest first, and carries the atlas identity", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          atlas_link: "http://www.brain-map.org"
        })
      });

      const result = await getAtlas(listing);

      expect(result).toEqual({
        name: listing.name,
        source: listing.source,
        manifest: {
          terminologyLocation: "/terminologies/allen_mouse-terminology/3_0",
          annotationSetLocation: "/annotation-sets/allen_mouse-annotation/3_0",
          atlasLink: "http://www.brain-map.org",
          resolutions: [
            [0.025, 0.025, 0.025],
            [0.1, 0.1, 0.1]
          ],
          shape: [
            [528, 320, 456],
            [132, 80, 114]
          ]
        }
      });
    });

    it("does not copy variantDirectories onto the resolved atlas", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        })
      });

      const result = await getAtlas(listing);

      expect(result).not.toHaveProperty("variantDirectories");
    });

    it("takes atlasLink from the finest variant's manifest", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114],
          atlas_link: "http://ignored.example"
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          atlas_link: "http://www.brain-map.org"
        })
      });

      const result = await getAtlas(listing);

      expect(result?.manifest.atlasLink).toBe("http://www.brain-map.org");
    });

    it("is null when the finest variant's manifest omits atlas_link", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        })
      });

      const result = await getAtlas(listing);

      expect(result?.manifest.atlasLink).toBeNull();
    });

    it("is null when the finest variant's manifest has an empty atlas_link", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          atlas_link: ""
        })
      });

      const result = await getAtlas(listing);

      expect(result?.manifest.atlasLink).toBeNull();
    });

    it("returns null when one of the manifest requests rejects", async () => {
      mockManifests({
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        })
      });

      expect(await getAtlas(listing)).toBeNull();
    });

    it("returns null when the finest variant's manifest has no terminology location", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          terminology: null
        })
      });

      expect(await getAtlas(listing)).toBeNull();
    });

    it("returns null when the finest variant's manifest has no annotation set location", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456],
          annotation_set: null
        })
      });

      expect(await getAtlas(listing)).toBeNull();
    });

    it("returns null when the request throws", async () => {
      mockedGet.mockRejectedValue(new Error("network error"));

      expect(await getAtlas(listing)).toBeNull();
    });
  });

  describe("HTTP host source", () => {
    const ATLASES_URL = "http://localhost:3000/brainglobe-atlasapi/atlases";
    const MANIFEST_URL_25 = `${ATLASES_URL}/allen_mouse_25um/3_0/manifest.json`;
    const MANIFEST_URL_100 = `${ATLASES_URL}/allen_mouse_100um/3_0/manifest.json`;

    const listing = makeAtlasListing({
      source: "http://localhost:3000",
      variantDirectories: ["allen_mouse_100um", "allen_mouse_25um"]
    });

    function mockManifests(manifests: Record<string, unknown>) {
      mockedGet.mockImplementation((url: string) =>
        url in manifests
          ? Promise.resolve({ data: manifests[url] })
          : Promise.reject(new Error(`unexpected request: ${url}`))
      );
    }

    it("requests one manifest per variant directory, issuing no directory listing", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        })
      });

      await getAtlas(listing);

      expect(mockedGet).toHaveBeenCalledWith(MANIFEST_URL_100);
      expect(mockedGet).toHaveBeenCalledWith(MANIFEST_URL_25);
      expect(mockedGet).toHaveBeenCalledTimes(2);
    });

    it("never requests the BrainGlobe bucket", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        })
      });

      await getAtlas(listing);

      expect(mockedGet).not.toHaveBeenCalledWith(
        expect.stringContaining("brainglobe.s3"),
        expect.anything()
      );
    });

    it("aggregates the variants' resolutions and shapes, finest first, and carries the atlas identity", async () => {
      mockManifests({
        [MANIFEST_URL_100]: rawManifest({
          resolution: [100, 100, 100],
          shape: [132, 80, 114]
        }),
        [MANIFEST_URL_25]: rawManifest({
          resolution: [25, 25, 25],
          shape: [528, 320, 456]
        })
      });

      const result = await getAtlas(listing);

      expect(result).toEqual({
        name: listing.name,
        source: listing.source,
        manifest: {
          terminologyLocation: "/terminologies/allen_mouse-terminology/3_0",
          annotationSetLocation: "/annotation-sets/allen_mouse-annotation/3_0",
          atlasLink: null,
          resolutions: [
            [0.025, 0.025, 0.025],
            [0.1, 0.1, 0.1]
          ],
          shape: [
            [528, 320, 456],
            [132, 80, 114]
          ]
        }
      });
    });

    it("returns null when the request throws", async () => {
      mockedGet.mockRejectedValue(new Error("network error"));

      expect(await getAtlas(listing)).toBeNull();
    });
  });

  it("returns null when the listing has no variant directories, without issuing any request", async () => {
    const result = await getAtlas(makeAtlasListing({ variantDirectories: [] }));

    expect(result).toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe("isAtlas", () => {
  it("accepts a well-formed atlas", () => {
    expect(isAtlas(makeAtlas())).toBe(true);
  });

  it("rejects a value missing a manifest", () => {
    const { manifest: _manifest, ...withoutManifest } = makeAtlas();

    expect(isAtlas(withoutManifest)).toBe(false);
  });

  it("rejects a manifest whose resolutions contain a non-triple entry", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({
        resolutions: [[0.025, 0.025, 0.025]]
      })
    });
    // Cast past the type system to simulate malformed persisted JSON.
    (atlas.manifest.resolutions as unknown[])[0] = [0.025, 0.025];

    expect(isAtlas(atlas)).toBe(false);
  });

  it("rejects a manifest whose atlasLink is a number", () => {
    const atlas = makeAtlas({ manifest: makeManifest() });
    (atlas.manifest as unknown as Record<string, unknown>).atlasLink = 42;

    expect(isAtlas(atlas)).toBe(false);
  });
});

describe("getAnnotationVolumeUrl", () => {
  it("builds the volume URL from the atlas's annotation set location on an HTTP host", () => {
    const result = getAnnotationVolumeUrl(makeAtlas());

    expect(result).toBe(
      "http://localhost:3000/brainglobe-atlasapi/annotation-sets/allen_mouse-annotation/3_0/annotations_compressed.ome.zarr"
    );
  });

  it("builds the volume URL from the atlas's annotation set location on the BrainGlobe bucket", () => {
    const bucketAtlas = makeAtlas({ source: BRAINGLOBE_BASE_URL });

    const result = getAnnotationVolumeUrl(bucketAtlas);

    expect(result).toBe(
      `${BRAINGLOBE_BASE_URL}annotation-sets/allen_mouse-annotation/3_0/annotations_compressed.ome.zarr`
    );
  });
});

describe("structureEntitiesFromIdentifiers", () => {
  const atlas = makeAtlas();
  const terminologyRows = makeTerminologyRows();

  it("resolves each identifier to its structure entity", () => {
    const result = structureEntitiesFromIdentifiers(
      atlas,
      terminologyRows,
      [8, 567]
    );

    expect(result.map(entity => entity.identifier)).toEqual([8, 567]);
  });

  it("drops identifiers that don't resolve to a row", () => {
    const result = structureEntitiesFromIdentifiers(
      atlas,
      terminologyRows,
      [8, 12345]
    );

    expect(result.map(entity => entity.identifier)).toEqual([8]);
  });

  it("returns an empty list for an empty input", () => {
    expect(
      structureEntitiesFromIdentifiers(atlas, terminologyRows, [])
    ).toEqual([]);
  });

  it("builds the mesh path from the atlas's annotation set location on an HTTP host", () => {
    const result = structureEntitiesFromIdentifiers(
      atlas,
      terminologyRows,
      [8]
    );

    expect(result[0]?.meshPath).toBe(
      "http://localhost:3000/brainglobe-atlasapi/annotation-sets/allen_mouse-annotation/3_0/annotations.precomputed/mesh/8"
    );
  });

  it("builds the mesh path from the atlas's annotation set location on the BrainGlobe bucket", () => {
    const bucketAtlas = makeAtlas({ source: BRAINGLOBE_BASE_URL });
    const result = structureEntitiesFromIdentifiers(
      bucketAtlas,
      terminologyRows,
      [8]
    );

    expect(result[0]?.meshPath).toBe(
      `${BRAINGLOBE_BASE_URL}annotation-sets/allen_mouse-annotation/3_0/annotations.precomputed/mesh/8`
    );
  });

  it("uses the manifest's own version rather than a hardcoded one", () => {
    const result = structureEntitiesFromIdentifiers(
      makeAtlas({
        manifest: makeManifest({
          annotationSetLocation:
            "/annotation-sets/allen-adult-human-annotation/2016"
        })
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
      atlas,
      terminologyRows,
      [8]
    );

    expect(result[0]?.identifier).toBe(8);
  });

  it("parses color_hex_triplet into a Color3", () => {
    const result = structureEntitiesFromIdentifiers(
      atlas,
      terminologyRows,
      [8]
    );

    expect(result[0]?.color).toEqual(Color3.FromHexString("#BFDAE3"));
  });
});

describe("getAtlasDimensionsMillimeters", () => {
  it("multiplies resolution by shape per axis", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({
        resolutions: [[0.02, 0.04, 0.06]],
        shape: [[100, 200, 300]]
      })
    });

    expect(getAtlasDimensionsMillimeters(atlas)).toEqual([2, 8, 18]);
  });

  it("uses only the finest (first) size variant when several are present", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({
        resolutions: [
          [0.02, 0.04, 0.06],
          [0.2, 0.4, 0.6]
        ],
        shape: [
          [100, 200, 300],
          [10, 20, 30]
        ]
      })
    });

    expect(getAtlasDimensionsMillimeters(atlas)).toEqual([2, 8, 18]);
  });

  it("falls back to [0, 0, 0] when the manifest has no resolutions", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({ resolutions: [], shape: [[100, 200, 300]] })
    });

    expect(getAtlasDimensionsMillimeters(atlas)).toEqual([0, 0, 0]);
  });

  it("falls back to [0, 0, 0] when the manifest has no shape", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({ resolutions: [[0.02, 0.04, 0.06]], shape: [] })
    });

    expect(getAtlasDimensionsMillimeters(atlas)).toEqual([0, 0, 0]);
  });
});

describe("getAtlasCenter", () => {
  it("halves resolution * shape per axis", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({
        resolutions: [[0.02, 0.04, 0.06]],
        shape: [[100, 200, 300]]
      })
    });

    expect(getAtlasCenter(atlas)).toEqual([1, 4, 9]);
  });

  it("uses only the finest (first) size variant when several are present", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({
        resolutions: [
          [0.02, 0.04, 0.06],
          [0.2, 0.4, 0.6]
        ],
        shape: [
          [100, 200, 300],
          [10, 20, 30]
        ]
      })
    });

    expect(getAtlasCenter(atlas)).toEqual([1, 4, 9]);
  });

  it("falls back to [0, 0, 0] when the manifest has no resolutions", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({ resolutions: [], shape: [[100, 200, 300]] })
    });

    expect(getAtlasCenter(atlas)).toEqual([0, 0, 0]);
  });

  it("falls back to [0, 0, 0] when the manifest has no shape", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({ resolutions: [[0.02, 0.04, 0.06]], shape: [] })
    });

    expect(getAtlasCenter(atlas)).toEqual([0, 0, 0]);
  });
});

describe("getAtlasLongestDimensionMillimeters", () => {
  it("picks the largest resolution * shape across axes, not just AP", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({
        resolutions: [[0.02, 0.04, 0.06]],
        shape: [[100, 200, 300]]
      })
    });

    // AP: 2, DV: 8, ML: 18 - ML is the longest, not the first axis.
    expect(getAtlasLongestDimensionMillimeters(atlas)).toBe(18);
  });

  it("uses only the finest (first) size variant when several are present", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({
        resolutions: [
          [0.02, 0.04, 0.06],
          [0.2, 0.4, 0.6]
        ],
        shape: [
          [100, 200, 300],
          [10, 20, 30]
        ]
      })
    });

    expect(getAtlasLongestDimensionMillimeters(atlas)).toBe(18);
  });

  it("falls back to 0 when the manifest has no resolutions", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({ resolutions: [], shape: [[100, 200, 300]] })
    });

    expect(getAtlasLongestDimensionMillimeters(atlas)).toBe(0);
  });

  it("falls back to 0 when the manifest has no shape", () => {
    const atlas = makeAtlas({
      manifest: makeManifest({ resolutions: [[0.02, 0.04, 0.06]], shape: [] })
    });

    expect(getAtlasLongestDimensionMillimeters(atlas)).toBe(0);
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

  it("compares a resolved atlas against a listing by identity fields", () => {
    const atlas = makeAtlas({ name: "allen_mouse", source: "https://a.test" });
    const listing = makeAtlasListing({
      name: "allen_mouse",
      source: "https://a.test"
    });

    expect(isSameAtlas(atlas, listing)).toBe(true);
  });
});
