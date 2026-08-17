import type { Color3, Vector3 } from "@babylonjs/core";

/** One axis of a coordinate frame, as the scene draws and drags it. */
export interface FrameAxis {
  /** Unit direction the axis's positive end points, in the frame's own space. */
  direction: Vector3;
  /** Colour the axis is drawn in. */
  color: Color3;
  /** User-facing name of the axis. */
  label: string;
}

/** The three axes of a coordinate frame, in the frame's own axis order. */
export type FrameAxes = [FrameAxis, FrameAxis, FrameAxis];

/**
 * A frame's axes plus the space they are expressed in: a node-local frame's
 * axes ride the node it is attached to, a world frame's stay put.
 */
export interface CoordinateFrame {
  axes: FrameAxes;
  /** Whether the axes are in the attached node's own space rather than world space. */
  isNodeLocal: boolean;
}
