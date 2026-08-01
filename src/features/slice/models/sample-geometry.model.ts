/**
 * A square oriented plane through the annotation volume, sampled row-major
 * with row 0 at the +up edge.
 */
export interface PlaneGeometry {
  kind: "plane";
  /** Plane center, in atlas ASR mm. */
  centerMillimeters: [number, number, number];
  /** Unit ASR direction of the plane's +u (rightward) axis. */
  rightMillimeters: [number, number, number];
  /** Unit ASR direction of the plane's +v (upward) axis. */
  upMillimeters: [number, number, number];
  /** Half the plane's edge length, in mm. */
  halfExtentMillimeters: number;
  /** Edge length of the square output, in pixels. */
  sizePixels: number;
}

/** A straight line through the annotation volume, sampled at even intervals. */
export interface LineGeometry {
  kind: "line";
  /** Line start, in atlas ASR mm. */
  originMillimeters: [number, number, number];
  /** Unit ASR direction the line travels in. */
  directionMillimeters: [number, number, number];
  /** Length of the line, in mm. */
  lengthMillimeters: number;
  /** Number of evenly spaced samples along the line. */
  sampleCount: number;
}

/** Geometry that can be sampled from the annotation volume. */
export type SampleGeometry = PlaneGeometry | LineGeometry;
