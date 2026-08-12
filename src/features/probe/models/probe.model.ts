import type { SceneModel } from "@/features/scene";
import type { ProbeVisibility } from "../models/visibility.model";

/**
 * Window along a probe's shanks that the channel map renders, in probe-local
 * mm up from the tip. Keys match Quasar's `QRange` model.
 */
export interface ProbeChannelMapWindow {
  /** Bottom edge of the window, in mm up from the tip. */
  min: number;
  /** Top edge of the window, in mm up from the tip. */
  max: number;
}

export interface Probe {
  inspectableKind: "probe";

  /**
   * Internal unique identifier. A UUID, not user facing.
   */
  id: string;

  /**
   * User-facing label. Need not be unique.
   */
  name: string;

  color: string;
  visibility: ProbeVisibility;

  /**
   * Is the probe locked against pose edits. Locked probes get no transform
   * gizmo and their position/rotation inputs are disabled.
   */
  lock: boolean;

  /**
   * Key into `Experiment.probeInterfaceProbes`, as produced by
   * `getProbeInterfaceIdentifier`.
   */
  probeInterfaceIdentifier: string;

  /**
   * Key into `Experiment.coordinateSystems`, as produced by
   * `getCoordinateSystemIdentifier`, or null when the probe's pose is entered
   * directly instead of through a coordinate system.
   */
  coordinateSystemIdentifier: string | null;

  /**
   * Internal position representation of the probe tip.
   * - AP, DV, ML order.
   * - ASR orientation.
   * - Relative to the atlas origin.
   * - In mm.
   *
   * UI may convert this information for different displays.
   */
  tipPosition: [number, number, number];

  /**
   * Internal orientation representation of the probe.
   * - Roll, yaw, pitch order (aligned to AP, DV, ML order;
   * at zero rotation the tip points along -AP and the head-stage cut-out,
   * i.e. the contact face, is on the -DV side of the shanks).
   * - Pivot on tip.
   * - In radians.
   */
  rotation: [number, number, number];

  /**
   * Edge length of the inspector's slice view, in mm. Null until the user
   * picks a zoom, so the slice view can default it from the current
   * atlas's average size.
   */
  sliceExtentMillimeters: number | null;

  /**
   * Height up the probe contour from the tip that the slice view centers on,
   * in probe-local mm.
   */
  sliceCenterHeightMillimeters: number;

  /**
   * Window along the probe's shanks the channel map renders, in probe-local
   * mm from the tip. Null until the user moves the range, so it defaults to
   * the probe's full contour height.
   */
  channelMapWindow: ProbeChannelMapWindow | null;

  /**
   * Index into the probe's shanks whose tip the transform node aligns with, or
   * null to align on the contour's center.
   */
  shankAlignmentIndex: number | null;

  /**
   * Placement of the 3D model that replaces the probe's head stage and rod, or
   * null to draw the built-in head stage and rod.
   */
  bodyModel: SceneModel | null;
}
