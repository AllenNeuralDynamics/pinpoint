/**
 * This file is copied from SpikeInterface's "probeinterface_library".
 *
 * It is currently manually updated from the source:
 * https://github.com/SpikeInterface/probeinterface_library/blob/main/apps/probe-viewer/src/types/probe.ts
 */

export interface ContactShapeParams {
  radius?: number; // for circle
  width?: number; // for square and rect
  height?: number; // for rect
}

export interface ProbeInterfaceProbe {
  ndim: number;
  si_units: string;
  annotations?: Record<string, unknown>;
  contact_positions: number[][];
  contact_shapes?: string[]; // "circle" | "square" | "rect"
  contact_shape_params?: ContactShapeParams[];
  contact_ids?: (string | number)[];
  shank_ids?: (string | number)[];
  // Per-contact face of the shank, e.g. "front" / "back". Present on
  // double-sided probes (Cambridge NeuroTech ASSY-325D-*), where front and back
  // contacts share the same (x, y) position.
  contact_sides?: string[];
  probe_planar_contour?: number[][];
}

export interface ProbeInterfaceFile {
  specification: string;
  version: string;
  probes: ProbeInterfaceProbe[];
}
