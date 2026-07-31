import type { ProbeVisibility } from "../models/visibility.model";

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
}
