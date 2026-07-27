import { Atlas } from "@/features/atlas";

export interface Experiment {
  name: string;
  atlas: Atlas;

  /**
   * Offset (in ASR, AP/DV/ML, mm) that the atlas root should be moved by such
   * that the scene origin is at this location in ASR.
   */
  referenceCoordinate: [number, number, number];

  /**
   * Identifiers of the atlas structures currently marked visible.
   */
  visibleStructures: number[];
}
