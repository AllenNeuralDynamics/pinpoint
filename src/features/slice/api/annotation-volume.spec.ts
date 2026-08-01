import { describe, expect, it } from "vitest";
import { makeAnnotationVolumeStore } from "@/test/fixtures";
import {
  openAnnotationVolume,
  readAnnotationChunk
} from "./annotation-volume.api";

describe("openAnnotationVolume", () => {
  it("reads a single level's shape, chunk shape, scale, and translation", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [8, 6, 4],
      chunkShapeVoxels: [2, 3, 4],
      scaleMillimeters: [0.02, 0.01, 0.005],
      translationMillimeters: [0.1, 0.2, 0.3]
    });

    const volume = await openAnnotationVolume(store, "http://example.com");

    expect(volume?.levels).toHaveLength(1);
    const level = volume!.levels[0]!;
    expect(level.path).toBe("s0");
    expect(level.shapeVoxels).toEqual([8, 6, 4]);
    expect(level.chunkShapeVoxels).toEqual([2, 3, 4]);
    expect(level.scaleMillimeters).toEqual([0.02, 0.01, 0.005]);
    expect(level.translationMillimeters).toEqual([0.1, 0.2, 0.3]);
  });

  it("defaults translation to zero when the dataset omits it", async () => {
    const store = makeAnnotationVolumeStore();
    // Overwrite the group metadata with a dataset that has no translation.
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
                  axes: [],
                  datasets: [
                    {
                      path: "s0",
                      coordinateTransformations: [
                        { type: "scale", scale: [0.01, 0.01, 0.01] }
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

    const volume = await openAnnotationVolume(store, "http://example.com");

    expect(volume?.levels[0]?.translationMillimeters).toEqual([0, 0, 0]);
  });

  it("returns null when /zarr.json is absent", async () => {
    const volume = await openAnnotationVolume(new Map(), "http://example.com");

    expect(volume).toBeNull();
  });

  it("returns null when there are no usable levels", async () => {
    const encoder = new TextEncoder();
    const store = new Map<string, Uint8Array>();
    store.set(
      "/zarr.json",
      encoder.encode(
        JSON.stringify({
          zarr_format: 3,
          node_type: "group",
          attributes: {
            ome: { version: "0.5", multiscales: [{ datasets: [] }] }
          }
        })
      )
    );

    const volume = await openAnnotationVolume(store, "http://example.com");

    expect(volume).toBeNull();
  });

  it("returns null when attributes.ome is entirely absent", async () => {
    const encoder = new TextEncoder();
    const store = new Map<string, Uint8Array>();
    store.set(
      "/zarr.json",
      encoder.encode(
        JSON.stringify({ zarr_format: 3, node_type: "group", attributes: {} })
      )
    );

    const volume = await openAnnotationVolume(store, "http://example.com");

    expect(volume).toBeNull();
  });

  it("skips a dataset with no scale transformation", async () => {
    const encoder = new TextEncoder();
    const store = new Map<string, Uint8Array>();
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
                { datasets: [{ path: "s0", coordinateTransformations: [] }] }
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
          shape: [4, 4, 4],
          data_type: "uint32",
          chunk_grid: {
            name: "regular",
            configuration: { chunk_shape: [2, 2, 2] }
          },
          chunk_key_encoding: {
            name: "default",
            configuration: { separator: "/" }
          },
          codecs: [{ name: "bytes", configuration: { endian: "little" } }],
          fill_value: 0
        })
      )
    );

    const volume = await openAnnotationVolume(store, "http://example.com");

    expect(volume).toBeNull();
  });

  it("sorts levels finest first even when their file order is reversed", async () => {
    const encoder = new TextEncoder();
    const store = new Map<string, Uint8Array>();
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
                  datasets: [
                    {
                      path: "s1",
                      coordinateTransformations: [
                        { type: "scale", scale: [0.1, 0.1, 0.1] }
                      ]
                    },
                    {
                      path: "s0",
                      coordinateTransformations: [
                        { type: "scale", scale: [0.01, 0.01, 0.01] }
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
    const arrayMetadata = (shape: number[], chunkShape: number[]) => ({
      zarr_format: 3,
      node_type: "array",
      shape,
      data_type: "uint32",
      chunk_grid: {
        name: "regular",
        configuration: { chunk_shape: chunkShape }
      },
      chunk_key_encoding: {
        name: "default",
        configuration: { separator: "/" }
      },
      codecs: [{ name: "bytes", configuration: { endian: "little" } }],
      fill_value: 0
    });
    store.set(
      "/s1/zarr.json",
      encoder.encode(JSON.stringify(arrayMetadata([4, 4, 4], [2, 2, 2])))
    );
    store.set(
      "/s0/zarr.json",
      encoder.encode(JSON.stringify(arrayMetadata([8, 8, 8], [2, 2, 2])))
    );

    const volume = await openAnnotationVolume(store, "http://example.com");

    expect(volume?.levels.map(level => level.path)).toEqual(["s0", "s1"]);
  });

  it("skips a dataset whose array is not 3D or not uint32", async () => {
    const encoder = new TextEncoder();
    const store = new Map<string, Uint8Array>();
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
                  datasets: [
                    {
                      path: "wrong-dtype",
                      coordinateTransformations: [
                        { type: "scale", scale: [0.01, 0.01, 0.01] }
                      ]
                    },
                    {
                      path: "s0",
                      coordinateTransformations: [
                        { type: "scale", scale: [0.02, 0.02, 0.02] }
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
      "/wrong-dtype/zarr.json",
      encoder.encode(
        JSON.stringify({
          zarr_format: 3,
          node_type: "array",
          shape: [4, 4, 4],
          data_type: "uint8",
          chunk_grid: {
            name: "regular",
            configuration: { chunk_shape: [2, 2, 2] }
          },
          chunk_key_encoding: {
            name: "default",
            configuration: { separator: "/" }
          },
          codecs: [{ name: "bytes" }],
          fill_value: 0
        })
      )
    );
    store.set(
      "/s0/zarr.json",
      encoder.encode(
        JSON.stringify({
          zarr_format: 3,
          node_type: "array",
          shape: [4, 4, 4],
          data_type: "uint32",
          chunk_grid: {
            name: "regular",
            configuration: { chunk_shape: [2, 2, 2] }
          },
          chunk_key_encoding: {
            name: "default",
            configuration: { separator: "/" }
          },
          codecs: [{ name: "bytes", configuration: { endian: "little" } }],
          fill_value: 0
        })
      )
    );

    const volume = await openAnnotationVolume(store, "http://example.com");

    expect(volume?.levels.map(level => level.path)).toEqual(["s0"]);
  });
});

describe("readAnnotationChunk", () => {
  it("decodes a written chunk's real bytes", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2],
      chunks: { "0/0/0": Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8]) }
    });
    const volume = await openAnnotationVolume(store, "http://example.com");

    const data = await readAnnotationChunk(volume!.levels[0]!, [0, 0, 0]);

    expect(Array.from(data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("returns the zero fill for a chunk that was never written", async () => {
    const store = makeAnnotationVolumeStore({
      shapeVoxels: [4, 4, 4],
      chunkShapeVoxels: [2, 2, 2]
    });
    const volume = await openAnnotationVolume(store, "http://example.com");

    const data = await readAnnotationChunk(volume!.levels[0]!, [1, 1, 1]);

    expect(Array.from(data)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
