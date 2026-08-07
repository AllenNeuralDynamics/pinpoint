import type {
  Atlas,
  AtlasListing,
  Manifest,
  TerminologyRow
} from "@/features/atlas";
import type { ProbeGeometry, SceneModel, SceneObject } from "@/features/scene";
import type { CameraPose } from "@/features/experiment";
import type { Probe, ProbeInterfaceProbe } from "@/features/probe";
import { getProbeInterfaceIdentifier } from "@/features/probe";

/**
 * Build a fixture scene model.
 * @param overrides Fields to override on the default scene model.
 */
export function makeSceneModel(
  overrides: Partial<SceneModel> = {}
): SceneModel {
  return {
    id: crypto.randomUUID(),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...overrides
  };
}

/**
 * Build a fixture scene object.
 * @param overrides Fields to override on the default scene object.
 */
export function makeSceneObject(
  overrides: Partial<SceneObject> = {}
): SceneObject {
  return {
    ...makeSceneModel(),
    inspectableKind: "sceneObject",
    name: "Object abc123",
    color: "#ffffff",
    visibility: "visible",
    lock: false,
    collidable: true,
    ...overrides
  };
}

/**
 * Build a fixture atlas.
 * @param overrides Fields to override on the default atlas.
 */
export function makeAtlas(overrides: Partial<Atlas> = {}): Atlas {
  return {
    name: "allen_mouse",
    source: "http://localhost:3000",
    manifest: makeManifest(),
    ...overrides
  };
}

/**
 * Build a fixture atlas manifest, defaulting to Allen-mouse-scale resolutions.
 * @param overrides Fields to override on the default manifest.
 */
export function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    terminologyLocation: "/terminologies/allen_mouse-terminology/3_0",
    annotationSetLocation: "/annotation-sets/allen_mouse-annotation/3_0",
    atlasLink: "http://www.brain-map.org",
    resolutions: [[0.025, 0.025, 0.025]],
    shape: [[528, 320, 456]],
    ...overrides
  };
}

/**
 * Build a fixture atlas listing.
 * @param overrides Fields to override on the default listing.
 */
export function makeAtlasListing(
  overrides: Partial<AtlasListing> = {}
): AtlasListing {
  return {
    name: "allen_mouse",
    source: "http://localhost:3000",
    variantDirectories: ["allen_mouse_25um"],
    ...overrides
  };
}

/**
 * Build a fixture probe interface definition.
 * @param overrides Fields to override on the default definition.
 */
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

/**
 * Build a fixture probe.
 * @param overrides Fields to override on the default probe.
 */
export function makeProbe(overrides: Partial<Probe> = {}): Probe {
  return {
    inspectableKind: "probe",
    id: crypto.randomUUID(),
    name: "Probe abc123",
    color: "#ffffff",
    visibility: "visible",
    lock: false,
    probeInterfaceIdentifier: getProbeInterfaceIdentifier(
      makeProbeInterfaceProbe()
    ),
    tipPosition: [0, 0, 0],
    rotation: [0, 0, 0],
    sliceExtentMillimeters: 2,
    sliceCenterHeightMillimeters: 0,
    channelMapWindow: null,
    shankAlignmentIndex: null,
    bodyModel: null,
    ...overrides
  };
}

/**
 * Build a fixture camera pose.
 * @param overrides Fields to override on the default pose.
 */
export function makeCameraPose(
  overrides: Partial<CameraPose> = {}
): CameraPose {
  return {
    inspectableKind: "camera",
    id: "camera-pose-id",
    name: "Pose",
    alpha: -Math.PI / 2,
    beta: Math.PI / 8,
    radius: 10,
    target: [0, 0, 0],
    ...overrides
  };
}

/**
 * Build a fixture terminology row.
 * @param overrides Fields to override on the default row.
 */
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
    ...overrides
  };
}

/**
 * Build a small terminology row tree: root(997) -> grey(8) -> [CH(567) ->
 * CTX(688), leaf(700)].
 */
export function makeTerminologyRows(): TerminologyRow[] {
  return [
    makeTerminologyRow({
      identifier: 997,
      parent_identifier: null,
      name: "root",
      abbreviation: "root",
      color_hex_triplet: "#FFFFFF"
    }),
    makeTerminologyRow({
      identifier: 8,
      parent_identifier: 997,
      annotation_value: 8,
      name: "basic cell groups and regions",
      abbreviation: "grey",
      color_hex_triplet: "#BFDAE3"
    }),
    makeTerminologyRow({
      identifier: 567,
      parent_identifier: 8,
      annotation_value: 567,
      name: "cerebrum",
      abbreviation: "CH",
      color_hex_triplet: "#B0F0FF"
    }),
    makeTerminologyRow({
      identifier: 688,
      parent_identifier: 567,
      annotation_value: 688,
      name: "cerebral cortex",
      abbreviation: "CTX",
      color_hex_triplet: "#B0FFB8"
    }),
    makeTerminologyRow({
      identifier: 700,
      parent_identifier: 8,
      annotation_value: 700,
      name: "leaf",
      abbreviation: "lf",
      color_hex_triplet: "#0000FF"
    })
  ];
}

/**
 * Build an in-memory, single-level OME-Zarr v3 uint32 annotation volume
 * store, keyed by path (a plain `Map` satisfies zarrita's `Readable`).
 * @param options Volume shape, scale, and chunk contents.
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

/** Probe body geometry matching the app's default preferences. */
export function makeProbeGeometry(): ProbeGeometry {
  return {
    shankThicknessMillimeters: 0.05,
    headStageLengthMillimeters: 20,
    headStageCutDepthMillimeters: 17.5,
    rodDiameterMillimeters: 8,
    rodLengthMillimeters: 200
  };
}
