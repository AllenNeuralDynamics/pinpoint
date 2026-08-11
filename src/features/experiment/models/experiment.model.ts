import type { Atlas } from "@/features/atlas";
import type { CoordinateSystem } from "@/features/coordinate-system";
import type { CameraPose } from "./camera-pose.model";
import type { VisibleStructure } from "./visible-structure.model";
import type { Probe, ProbeInterfaceProbe } from "@/features/probe";
import type { SceneObject } from "@/features/scene";

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
   * landmark of interest within the atlas. A landmark only: geometry
   * (probe tips, scene objects, camera targets) is stored in atlas ASR mm,
   * independent of this value.
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

  /**
   * Coordinate system definitions used by this experiment's probes, keyed by
   * coordinate system identifier and referenced from
   * `Probe.coordinateSystemIdentifier`.
   */
  coordinateSystems: Record<string, CoordinateSystem>;

  probes: Probe[];

  /** Live orbit and target of the scene camera. */
  cameraPose: CameraPose;

  /** Arbitrary 3D models placed in the scene, in user-arranged order. */
  sceneObjects: SceneObject[];

  /** Saved camera poses, in user-arranged order. */
  cameraPoses: CameraPose[];
}
