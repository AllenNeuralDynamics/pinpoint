import type { SampleChunkRequest } from "./sample-plan.model";

/** Open a volume for sampling, replacing any previously open one. */
export interface OpenSamplerMessage {
  type: "open";
  url: string;
}

/** Replace the annotation-value-to-color lookup used by future flushes. */
export interface ColorsSamplerMessage {
  type: "colors";
  colors: Map<number, number>;
}

/** Sample this shard's chunk requests for one stream, superseding any prior generation. */
export interface SampleSamplerMessage {
  type: "sample";
  streamId: string;
  generation: number;
  levelIndex: number;
  requests: SampleChunkRequest[];
}

/** Abort a stream's in-flight work. */
export interface CancelSamplerMessage {
  type: "cancel";
  streamId: string;
}

/** Abort every stream and release the open volume. */
export interface CloseSamplerMessage {
  type: "close";
}

/** Messages the main thread sends to a sampler worker. */
export type InboundSamplerMessage =
  | OpenSamplerMessage
  | ColorsSamplerMessage
  | SampleSamplerMessage
  | CancelSamplerMessage
  | CloseSamplerMessage;

/**
 * One coalesced batch of sampled chunks for a stream. `sampleIndices`,
 * `annotationValues`, and `colors` are index-aligned and sparse - only
 * non-background samples are included. `chunkCount` is the number of chunks
 * folded into this flush (which may be 0 if every one was background), for
 * the main thread to sum against the shard's total request count.
 */
export interface SampledMessage {
  type: "sampled";
  streamId: string;
  generation: number;
  chunkCount: number;
  sampleIndices: Int32Array;
  annotationValues: Uint32Array;
  colors: Uint32Array;
}

/** Messages a sampler worker sends to the main thread. */
export type OutboundSamplerMessage = SampledMessage;
