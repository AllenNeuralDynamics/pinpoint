import { Matrix, Quaternion, Vector3 } from "@babylonjs/core";
import { type Atlas, getAtlasCenter } from "@/features/atlas";
import type { AxisDirections, Matrix3 } from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  convertCoordinate,
  convertMagnitudes,
  getOrientationFromFrame,
  getOrientationInFrame
} from "@/utils/coordinate-frame";

/**
 * Axis directions of the atlas root node's local space, which every scene node
 * hanging off that root is placed in. It is the atlas's own frame with its axes
 * reversed, so scene x runs along the atlas's left-right axis, y along its
 * superior-inferior axis and z along its anterior-posterior one; deriving it
 * keeps it from ever disagreeing with the atlas about which way is right.
 */
export const SCENE_AXIS_DIRECTIONS: AxisDirections = [
  ATLAS_AXIS_DIRECTIONS[2],
  ATLAS_AXIS_DIRECTIONS[1],
  ATLAS_AXIS_DIRECTIONS[0]
];

/**
 * Coordinate in the atlas root node's local space, for a coordinate in the
 * given frame.
 * @param from Axis directions the coordinate is in.
 * @param coordinate Coordinate to convert.
 */
export function toSceneVector(
  from: AxisDirections,
  coordinate: [number, number, number]
): Vector3 {
  const [x, y, z] = convertCoordinate(from, SCENE_AXIS_DIRECTIONS, coordinate);
  return new Vector3(x, y, z);
}

/**
 * Coordinate in the given frame, for a coordinate in the atlas root node's
 * local space.
 * @param to Axis directions to convert into.
 * @param vector Vector in the atlas root node's local space.
 */
export function fromSceneVector(
  to: AxisDirections,
  vector: Vector3
): [number, number, number] {
  return convertCoordinate(SCENE_AXIS_DIRECTIONS, to, [
    vector.x,
    vector.y,
    vector.z
  ]);
}

/**
 * Axis-wise magnitudes in the atlas root node's local space, such as a scale,
 * which permute with the axes but never change sign.
 * @param from Axis directions the magnitudes are in.
 * @param magnitudes Magnitudes to convert.
 */
export function toSceneMagnitudes(
  from: AxisDirections,
  magnitudes: [number, number, number]
): Vector3 {
  const [x, y, z] = convertMagnitudes(from, SCENE_AXIS_DIRECTIONS, magnitudes);
  return new Vector3(x, y, z);
}

/**
 * Axis-wise magnitudes in the given frame, for magnitudes in the atlas root
 * node's local space.
 * @param to Axis directions to convert into.
 * @param vector Magnitudes in the atlas root node's local space.
 */
export function fromSceneMagnitudes(
  to: AxisDirections,
  vector: Vector3
): [number, number, number] {
  return convertMagnitudes(SCENE_AXIS_DIRECTIONS, to, [
    vector.x,
    vector.y,
    vector.z
  ]);
}

/**
 * Babylon world coordinate, for a coordinate in the given frame relative to
 * the atlas origin. World space is the scene frame with its y and z negated,
 * which is the atlas root's half turn about x, less the offset that centers
 * the atlas on the origin.
 * @param from Axis directions the coordinate is in.
 * @param atlas Atlas whose center anchors world space.
 * @param coordinate Coordinate relative to the atlas origin.
 */
export function toWorldVector(
  from: AxisDirections,
  atlas: Atlas,
  coordinate: [number, number, number]
): Vector3 {
  const [x, y, z] = convertCoordinate(from, SCENE_AXIS_DIRECTIONS, coordinate);
  const center = sceneAtlasCenter(atlas);
  return new Vector3(x - center[0], center[1] - y, center[2] - z);
}

/**
 * Babylon world direction, for a direction in the given frame. A direction
 * carries no origin, so unlike `toWorldVector` it is not shifted by the offset
 * that centers the atlas.
 * @param from Axis directions the direction is in.
 * @param direction Direction to convert.
 */
export function toWorldDirection(
  from: AxisDirections,
  direction: [number, number, number]
): Vector3 {
  const [x, y, z] = convertCoordinate(from, SCENE_AXIS_DIRECTIONS, direction);
  return new Vector3(x, -y, -z);
}

/**
 * Coordinate in the given frame relative to the atlas origin, for a Babylon
 * world coordinate.
 * @param to Axis directions to convert into.
 * @param atlas Atlas whose center anchors world space.
 * @param vector Coordinate in Babylon world space.
 */
export function fromWorldVector(
  to: AxisDirections,
  atlas: Atlas,
  vector: Vector3
): [number, number, number] {
  const center = sceneAtlasCenter(atlas);
  return convertCoordinate(SCENE_AXIS_DIRECTIONS, to, [
    vector.x + center[0],
    center[1] - vector.y,
    center[2] - vector.z
  ]);
}

/**
 * Quaternion an orientation drives a scene node with, i.e. the orientation
 * re-expressed in the atlas root node's local space.
 * @param orientation Orientation in canonical anatomical coordinates.
 */
export function toSceneQuaternion(orientation: Matrix3): Quaternion {
  const m = getOrientationInFrame(SCENE_AXIS_DIRECTIONS, orientation);
  // Babylon matrices multiply row vectors, so its rows are this matrix's columns.
  return Quaternion.FromRotationMatrix(
    Matrix.FromValues(
      m[0],
      m[3],
      m[6],
      0,
      m[1],
      m[4],
      m[7],
      0,
      m[2],
      m[5],
      m[8],
      0,
      0,
      0,
      0,
      1
    )
  );
}

/**
 * Orientation a scene node's quaternion carries, in canonical anatomical
 * coordinates, inverting `toSceneQuaternion`.
 * @param quaternion Quaternion the node is rotated by.
 */
export function fromSceneQuaternion(quaternion: Quaternion): Matrix3 {
  const matrix = new Matrix();
  quaternion.toRotationMatrix(matrix);
  const values = matrix.m;
  return getOrientationFromFrame(SCENE_AXIS_DIRECTIONS, [
    values[0]!,
    values[4]!,
    values[8]!,
    values[1]!,
    values[5]!,
    values[9]!,
    values[2]!,
    values[6]!,
    values[10]!
  ]);
}

/**
 * Center of an atlas in the atlas root node's local space, which is the offset
 * that node is shifted by.
 * @param atlas Atlas whose center to convert.
 */
function sceneAtlasCenter(atlas: Atlas): [number, number, number] {
  return convertCoordinate(
    ATLAS_AXIS_DIRECTIONS,
    SCENE_AXIS_DIRECTIONS,
    getAtlasCenter(atlas)
  );
}
