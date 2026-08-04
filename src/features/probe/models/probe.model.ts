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
   * Internal position representation of the probe tip.
   * - AP, DV, ML order.
   * - ASR orientation.
   * - Relative to atlas origin.
   * - In mm.
   *
   * UI may convert this information for different displays.
   */
  tipPosition: [number, number, number];

  /**
   * Internal orientation representation of the probe.
   * - Roll, yaw, pitch order (aligned to AP, DV, ML order
   * where zero is electrodes facing superior and tip facing anterior).
   * - Pivot on tip.
   * - In radians.
   */
  rotation: [number, number, number];

  /**
   * Edge length of the inspector's slice view, in mm. Null until the user
   * picks a zoom, so the slice view can default it proportionally to the
   * current atlas instead of a fixed value.
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
}
