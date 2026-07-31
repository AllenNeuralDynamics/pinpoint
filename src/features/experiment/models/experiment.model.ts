import type { Atlas } from "@/features/atlas";
import type { Probe, ProbeInterfaceProbe } from "@/features/probe";

export interface Experiment {
  name: string;
  atlas: Atlas;

  /**
   * Reference coordinate (in ASR, AP/DV/ML, mm) marking the experiment's
   * landmark of interest within the atlas. Tracked separately from the
   * scene's origin, which is anchored to the atlas center instead.
   */
  referenceCoordinate: [number, number, number];

  /**
   * Identifiers of the atlas structures currently marked visible.
   */
  visibleStructures: number[];

  /**
   * Probe interface definitions used by this experiment's probes, keyed by
   * probe identifier and referenced from `Probe.probeIdentifier`.
   */
  probeInterfaceProbes: Record<string, ProbeInterfaceProbe>;

  probes: Probe[];
}
