import type { Atlas } from "@/features/atlas";
import type { ExperimentAuthor } from "./experiment-author.model";
import type { CoordinateSystem } from "@/features/coordinate-system";
import type { CameraPose } from "./camera-pose.model";
import type { VisibleStructure } from "./visible-structure.model";
import type { Probe, ProbeInterfaceProbe } from "@/features/probe";
import type { SceneObject } from "@/features/scene";
import type {
  GlobalCoordinateSystem,
  LocalCoordinateSystem
} from "@/utils/coordinate-frame";

export interface Experiment {
  // Unique identifier.
  id: string;

  // Semantic version of Pinpoint.
  version: string;

  /** ISO-8601 timestamp of the experiment's last edit, used to resolve syncs. */
  updatedAt: string;

  /** ORCID account this experiment belongs to, or null while unclaimed. */
  author: ExperimentAuthor | null;

  // Can be anything since ID is unique.
  name: string;
  atlas: Atlas;

  /**
   * Coordinate system every coordinate in this experiment is expressed in:
   * probe tips, probe rotations, scene object poses, camera targets, and the
   * reference coordinate. Changing it re-expresses all of them, so nothing
   * moves.
   */
  globalCoordinateSystem: GlobalCoordinateSystem;

  /**
   * Orientation every probe rests in before its own rotations and translations
   * are applied.
   */
  localCoordinateSystem: LocalCoordinateSystem;

  /**
   * Reference coordinate marking the experiment's landmark of interest within
   * the atlas, in `globalCoordinateSystem` mm relative to the atlas origin. A
   * landmark only: geometry is stored independent of this value.
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
