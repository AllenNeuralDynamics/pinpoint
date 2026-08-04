import type { TerminologyRow } from "@/features/atlas";

/** A structure hovered on a channel map, with the client-space point its tooltip anchors to. */
export interface ChannelMapHover {
  /** Structure under the pointer. */
  structure: TerminologyRow;
  /** Client x of the channel map's right edge. */
  clientX: number;
  /** Client y of the pointer. */
  clientY: number;
}
