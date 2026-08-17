import { Color3, Vector3 } from "@babylonjs/core";
import {
  CANONICAL_AXIS_DIRECTIONS,
  getAxisDirections,
  getDirectionLine,
  getDirectionVector,
  getProbeRestRotation,
  getRightDirection,
  transformVector,
  transposeMatrix,
  type AnatomicalDirection,
  type AnatomicalLine,
  type GlobalCoordinateSystem,
  type LocalCoordinateSystem
} from "@/utils/coordinate-frame";
import type { CoordinateFrame, FrameAxes } from "../models/frame-axis.model";
import { toWorldDirection } from "./coordinate-transforms.api";

/**
 * Colour of a global axis, keyed by the anatomical line it runs along so
 * reordering or flipping an axis never recolours it. Quasar's `red`, `green`
 * and `blue`.
 */
export const GLOBAL_FRAME_AXIS_COLORS: Record<AnatomicalLine, Color3> = {
  leftRight: Color3.FromHexString("#f44336"),
  inferiorSuperior: Color3.FromHexString("#4caf50"),
  posteriorAnterior: Color3.FromHexString("#2196f3")
};

/**
 * Colour of a local axis, indexed as `getLocalFrameAxes` orders them, in a
 * palette deliberately unlike the global one so the two frames never look
 * alike. Quasar's `amber`, `purple` and `cyan`.
 */
export const LOCAL_FRAME_AXIS_COLORS: [Color3, Color3, Color3] = [
  Color3.FromHexString("#ffc107"),
  Color3.FromHexString("#9c27b0"),
  Color3.FromHexString("#00bcd4")
];

/**
 * The global coordinate system's own axes, in Babylon world space, so a gizmo
 * or guide drawn along them points exactly where the user defined.
 * @param system Global coordinate system to read.
 * @param labels User-facing name per axis, indexed by axis.
 */
export function getGlobalFrameAxes(
  system: GlobalCoordinateSystem,
  labels: [string, string, string]
): CoordinateFrame {
  const directions = getAxisDirections(system);
  return {
    isNodeLocal: false,
    axes: directions.map((direction, axis) => ({
      direction: toWorldDirection(
        CANONICAL_AXIS_DIRECTIONS,
        getDirectionVector(direction)
      ),
      color: GLOBAL_FRAME_AXIS_COLORS[getDirectionLine(direction)],
      label: labels[axis]!
    })) as FrameAxes
  };
}

/**
 * A probe's local coordinate system axes, in probe node space, ordered depth,
 * forward, right as the preferences read them. The probe's meshes are built in
 * their own body frame, whose axes run opposite these, so each direction is
 * resolved through the rest orientation rather than assumed.
 * @param system Local coordinate system the probe rests in.
 * @param labels User-facing name per axis, ordered depth, forward, right.
 */
export function getLocalFrameAxes(
  system: LocalCoordinateSystem,
  labels: [string, string, string]
): CoordinateFrame {
  const toBody = transposeMatrix(getProbeRestRotation(system));
  const rightDirection = getRightDirection(system);
  const directions: [
    AnatomicalDirection,
    AnatomicalDirection,
    AnatomicalDirection
  ] = [
    system.depthDirection,
    system.forwardDirection,
    // A perpendicular depth and forward pair always has a right axis; the
    // coordinate system's own guard keeps them perpendicular.
    rightDirection ?? system.depthDirection
  ];

  return {
    isNodeLocal: true,
    axes: directions.map((direction, axis) => {
      const [x, y, z] = transformVector(toBody, getDirectionVector(direction));
      return {
        direction: new Vector3(x, y, z),
        color: LOCAL_FRAME_AXIS_COLORS[axis]!,
        label: labels[axis]!
      };
    }) as FrameAxes
  };
}

/**
 * A plain node's own axes, for entities with no anatomical local frame of their
 * own, such as scene objects and probe body models.
 * @param labels User-facing name per axis, indexed by Babylon axis.
 */
export function getNodeFrameAxes(
  labels: [string, string, string]
): CoordinateFrame {
  return {
    isNodeLocal: true,
    axes: [
      new Vector3(1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 0, 1)
    ].map((direction, axis) => ({
      direction,
      color: LOCAL_FRAME_AXIS_COLORS[axis]!,
      label: labels[axis]!
    })) as FrameAxes
  };
}
