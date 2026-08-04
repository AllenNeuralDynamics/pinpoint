/** The samples of one output geometry that read from a single annotation chunk. */
export interface SampleChunkRequest {
  chunkCoordinates: [number, number, number];
  /** Output sample indices, index-aligned with `voxelOffsets`. */
  sampleIndices: Int32Array<ArrayBuffer>;
  /** Chunk-local linear voxel offsets, index-aligned with `sampleIndices`. */
  voxelOffsets: Int32Array<ArrayBuffer>;
}

/** Everything needed to fill one geometry's samples, resolved before any I/O. */
export interface SamplePlan {
  levelIndex: number;
  chunkRequests: SampleChunkRequest[];
}
