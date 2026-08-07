import type { Atlas } from "@/features/atlas";
import type { CameraPose } from "./camera-pose.model";
import type { VisibleStructure } from "./visible-structure.model";
import type { Probe, ProbeInterfaceProbe } from "@/features/probe";

export interface Experiment {
  // Unique identifier.
  id: string;

  // Semantic version of Pinpoint.
  version: string;

  // Can be anything since ID is unique.
  name: string;
  atlas: Atlas;

  /**
   * Reference coordinate (in ASR, AP/DV/ML, mm) marking the experiment's
   * landmark of interest within the atlas. Tracked separately from the
   * scene's origin, which is anchored to the atlas center instead.
   */
  referenceCoordinate: [number, number, number];

  /**
   * Structures currently shown on the atlas, at most one entry per `id`.
   */
  visibleStructures: VisibleStructure[];

  /**
   * Probe interface definitions used by this experiment's probes, keyed by
   * probe identifier and referenced from `Probe.probeIdentifier`.
   */
  probeInterfaceProbes: Record<string, ProbeInterfaceProbe>;

  probes: Probe[];

  /** Live orbit and target of the scene camera. */
  cameraPose: CameraPose;

  /** Saved camera poses, in user-arranged order. */
  cameraPoses: CameraPose[];
}
