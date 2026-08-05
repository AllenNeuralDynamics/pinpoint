/** Shape of the generic probe body built around a probe's contour, in mm. */
export interface ProbeGeometry {
  /** Thickness of the extruded shank. */
  shankThicknessMillimeters: number;
  /** Length of the head stage cone along the probe axis. */
  headStageLengthMillimeters: number;
  /** How far the cutter block bites into the head stage, measured from its base. */
  headStageCutDepthMillimeters: number;
  /** Diameter of the rod, which is also the head stage cone's top diameter. */
  rodDiameterMillimeters: number;
  /** Length of the rod. */
  rodLengthMillimeters: number;
}
