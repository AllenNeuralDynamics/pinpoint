import type { Atlas, Manifest, TerminologyRow } from "@/features/atlas";
import type { Probe, ProbeInterfaceProbe } from "@/features/probe";
import { getProbeInterfaceIdentifier } from "@/features/probe";

/**
 * Test fixture factories.
 *
 * Each factory returns a fresh object (no shared references between calls) so
 * tests can freely mutate their own copy. `overrides` are shallow-merged on
 * top of the default shape.
 */

export function makeAtlas(overrides: Partial<Atlas> = {}): Atlas {
  return {
    name: "allen_mouse",
    source: "http://localhost:3000",
    ...overrides
  };
}

export function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    atlas: makeAtlas(),
    terminologyLocation: "/terminologies/allen_mouse-terminology/3_0",
    annotationSetLocation: "/annotation-sets/allen_mouse-annotation/3_0",
    resolutions: [[0.025, 0.025, 0.025]],
    shape: [[528, 320, 456]],
    ...overrides
  };
}

export function makeProbeInterfaceProbe(
  overrides: Partial<ProbeInterfaceProbe> = {}
): ProbeInterfaceProbe {
  return {
    ndim: 2,
    si_units: "um",
    contact_positions: [[0, 0]],
    annotations: { manufacturer: "cambridgeneurotech", model_name: "ASSY-1" },
    ...overrides
  };
}

export function makeProbe(overrides: Partial<Probe> = {}): Probe {
  return {
    inspectableKind: "probe",
    id: crypto.randomUUID(),
    name: "Probe abc123",
    color: "#ffffff",
    visibility: "visible",
    probeInterfaceIdentifier: getProbeInterfaceIdentifier(
      makeProbeInterfaceProbe()
    ),
    tipPosition: [0, 0, 0],
    rotation: [0, 0, 0],
    sliceExtentMillimeters: 2,
    sliceCenterHeightMillimeters: 0,
    ...overrides
  };
}

export function makeTerminologyRow(
  overrides: Partial<TerminologyRow> = {}
): TerminologyRow {
  return {
    identifier: 997,
    parent_identifier: null,
    annotation_value: 997,
    name: "root",
    abbreviation: "root",
    color_hex_triplet: "#FFFFFF",
    root_identifier_path: [997],
    ...overrides
  };
}

/**
 * Build a small terminology row tree with root-anchored
 * `root_identifier_path`s (the well-formed case, e.g. `allen_mouse`).
 *
 * Tree shape: root(997) -> grey(8) -> [CH(567) -> CTX(688), leaf(700)].
 */
export function makeTerminologyRows(): TerminologyRow[] {
  return [
    makeTerminologyRow({
      identifier: 997,
      parent_identifier: null,
      name: "root",
      abbreviation: "root",
      color_hex_triplet: "#FFFFFF",
      root_identifier_path: [997]
    }),
    makeTerminologyRow({
      identifier: 8,
      parent_identifier: 997,
      annotation_value: 8,
      name: "basic cell groups and regions",
      abbreviation: "grey",
      color_hex_triplet: "#BFDAE3",
      root_identifier_path: [997, 8]
    }),
    makeTerminologyRow({
      identifier: 567,
      parent_identifier: 8,
      annotation_value: 567,
      name: "cerebrum",
      abbreviation: "CH",
      color_hex_triplet: "#B0F0FF",
      root_identifier_path: [997, 8, 567]
    }),
    makeTerminologyRow({
      identifier: 688,
      parent_identifier: 567,
      annotation_value: 688,
      name: "cerebral cortex",
      abbreviation: "CTX",
      color_hex_triplet: "#B0FFB8",
      root_identifier_path: [997, 8, 567, 688]
    }),
    makeTerminologyRow({
      identifier: 700,
      parent_identifier: 8,
      annotation_value: 700,
      name: "leaf",
      abbreviation: "lf",
      color_hex_triplet: "#0000FF",
      root_identifier_path: [997, 8, 700]
    })
  ];
}

/**
 * Build the same tree as {@link makeTerminologyRows}, but with
 * `root_identifier_path`s authored as relative `[parent, self]` pairs
 * instead of full root-anchored paths (the `african_molerat` case). Used to
 * regression-test that `buildHierarchy` relies on `parent_identifier`, not
 * `root_identifier_path`, since the latter drops rows for atlases like this.
 */
export function makeRelativePathTerminologyRows(): TerminologyRow[] {
  return makeTerminologyRows().map(row =>
    row.parent_identifier === null
      ? row
      : {
          ...row,
          root_identifier_path: [row.parent_identifier, row.identifier]
        }
  );
}

/**
 * Build an in-memory, single-level OME-Zarr v3 uint32 annotation volume
 * store, keyed by path (a plain `Map` satisfies zarrita's `Readable`). Chunks
 * are stored uncompressed so tests exercise the real codec pipeline and
 * chunk-key encoding without a wasm decoder.
 */
export function makeAnnotationVolumeStore(options?: {
  shapeVoxels?: [number, number, number];
  chunkShapeVoxels?: [number, number, number];
  scaleMillimeters?: [number, number, number];
  translationMillimeters?: [number, number, number];
  /** Chunk contents, keyed `"<ap>/<dv>/<ml>"`. Omitted chunks read as zero-filled. */
  chunks?: Record<string, Uint32Array>;
}): Map<string, Uint8Array> {
  const shapeVoxels = options?.shapeVoxels ?? [4, 4, 4];
  const chunkShapeVoxels = options?.chunkShapeVoxels ?? [2, 2, 2];
  const scaleMillimeters = options?.scaleMillimeters ?? [0.01, 0.01, 0.01];
  const translationMillimeters = options?.translationMillimeters ?? [0, 0, 0];

  const store = new Map<string, Uint8Array>();
  const encoder = new TextEncoder();

  store.set(
    "/zarr.json",
    encoder.encode(
      JSON.stringify({
        zarr_format: 3,
        node_type: "group",
        attributes: {
          ome: {
            version: "0.5",
            multiscales: [
              {
                axes: [
                  { name: "z", type: "space", unit: "millimeter" },
                  { name: "y", type: "space", unit: "millimeter" },
                  { name: "x", type: "space", unit: "millimeter" }
                ],
                datasets: [
                  {
                    path: "s0",
                    coordinateTransformations: [
                      { type: "scale", scale: scaleMillimeters },
                      {
                        type: "translation",
                        translation: translationMillimeters
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }
      })
    )
  );

  store.set(
    "/s0/zarr.json",
    encoder.encode(
      JSON.stringify({
        zarr_format: 3,
        node_type: "array",
        shape: shapeVoxels,
        data_type: "uint32",
        chunk_grid: {
          name: "regular",
          configuration: { chunk_shape: chunkShapeVoxels }
        },
        chunk_key_encoding: {
          name: "default",
          configuration: { separator: "/" }
        },
        codecs: [{ name: "bytes", configuration: { endian: "little" } }],
        fill_value: 0,
        dimension_names: ["z", "y", "x"]
      })
    )
  );

  for (const [key, data] of Object.entries(options?.chunks ?? {})) {
    store.set(
      `/s0/c/${key}`,
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
  }

  return store;
}
