import type { Array as ZarrArray, DataType, Readable } from "zarrita";

/** One multiscale level of an annotation volume. */
export interface AnnotationLevel {
  /** Multiscale dataset path, e.g. `s0`. */
  path: string;
  array: ZarrArray<DataType, Readable>;
  /** Voxel counts as [ap, dv, ml], matching the zarr [z, y, x] axis order. */
  shapeVoxels: [number, number, number];
  chunkShapeVoxels: [number, number, number];
  /** Per-axis voxel size in mm, as [ap, dv, ml]. Never a scalar - atlases are anisotropic. */
  scaleMillimeters: [number, number, number];
  /** Per-axis origin offset in mm, as [ap, dv, ml]. */
  translationMillimeters: [number, number, number];
}

/** An annotation volume's multiscale levels, sorted finest first. */
export interface AnnotationVolume {
  url: string;
  levels: AnnotationLevel[];
}
