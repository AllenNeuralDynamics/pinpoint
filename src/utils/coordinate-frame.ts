import type { AxisIndex, AxisOrder } from "./axis-order";
import { IDENTITY_AXIS_ORDER, isAxisOrder } from "./axis-order";
import { isRecord } from "./type-guards";

/**
 * Direction a coordinate axis's positive values point, using the
 * `aind-data-schema` `Direction` values.
 */
export type AnatomicalDirection =
  | "Left_to_right"
  | "Right_to_left"
  | "Posterior_to_anterior"
  | "Anterior_to_posterior"
  | "Inferior_to_superior"
  | "Superior_to_inferior";

/** Anatomical line a pair of opposite directions runs along. */
export type AnatomicalLine =
  | "leftRight"
  | "posteriorAnterior"
  | "inferiorSuperior";

/** One axis of a coordinate system: where its positive values point, and its names. */
export interface CoordinateAxis {
  /** Anatomical direction this axis's positive values point. */
  direction: AnatomicalDirection;
  /** User name for positions along this axis; empty falls back to the built-in label. */
  positionName: string;
  /** User name for rotations about this axis; empty falls back to the built-in label. */
  rotationName: string;
}

/**
 * Coordinate system every coordinate in an experiment is expressed in: three
 * anatomically directed axes plus the order their inputs are shown in.
 */
export interface GlobalCoordinateSystem {
  axes: [CoordinateAxis, CoordinateAxis, CoordinateAxis];
  /** Order position inputs are shown in, as display slot -> axis index. */
  positionDisplayOrder: AxisOrder;
  /** Order rotation inputs are shown in, as display slot -> axis index. */
  rotationDisplayOrder: AxisOrder;
}

/**
 * Orientation a probe rests in, before its own rotations and translations are
 * applied, as the global-space directions of its depth and forward axes. The
 * right axis follows from those two.
 */
export interface LocalCoordinateSystem {
  /** Direction the probe advances as it is inserted. */
  depthDirection: AnatomicalDirection;
  /** Direction the electrodes face. */
  forwardDirection: AnatomicalDirection;
}

/** Ordered directions of a frame's three axes, which every conversion takes. */
export type AxisDirections = [
  AnatomicalDirection,
  AnatomicalDirection,
  AnatomicalDirection
];

/**
 * A 3x3 matrix in row-major order. Unless stated otherwise a matrix maps the
 * coordinates it was built for into canonical anatomical coordinates: x right,
 * y anterior, z superior.
 */
export type Matrix3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

/**
 * Directions of the canonical anatomical frame every matrix in this module is
 * expressed in: x right, y anterior, z superior.
 */
export const CANONICAL_AXIS_DIRECTIONS: AxisDirections = [
  "Left_to_right",
  "Posterior_to_anterior",
  "Inferior_to_superior"
];

/**
 * Directions of an atlas's own axes: index 0 runs anterior to posterior, index
 * 1 superior to inferior, and index 2 left to right, i.e. the Allen CCF's `PIR`
 * ordering, which `aind-data-schema`'s own atlas library declares as
 * `AP`/`SI`/`ML` with `ML` pointing left to right. Every atlas this app reads
 * is stored that way, so a larger third coordinate is further toward the
 * animal's right.
 */
export const ATLAS_AXIS_DIRECTIONS: AxisDirections = [
  "Anterior_to_posterior",
  "Superior_to_inferior",
  "Left_to_right"
];

/** Every anatomical direction, in the order direction pickers list them. */
export const ANATOMICAL_DIRECTIONS: AnatomicalDirection[] = [
  "Left_to_right",
  "Right_to_left",
  "Posterior_to_anterior",
  "Anterior_to_posterior",
  "Inferior_to_superior",
  "Superior_to_inferior"
];

/** Anatomical line each direction runs along. */
const DIRECTION_LINES: Record<AnatomicalDirection, AnatomicalLine> = {
  Left_to_right: "leftRight",
  Right_to_left: "leftRight",
  Posterior_to_anterior: "posteriorAnterior",
  Anterior_to_posterior: "posteriorAnterior",
  Inferior_to_superior: "inferiorSuperior",
  Superior_to_inferior: "inferiorSuperior"
};

/** Canonical axis index each anatomical line occupies: x right, y anterior, z superior. */
const LINE_CANONICAL_INDEXES: Record<AnatomicalLine, AxisIndex> = {
  leftRight: 0,
  posteriorAnterior: 1,
  inferiorSuperior: 2
};

/** Whether a direction points along its canonical axis or against it. */
const DIRECTION_SIGNS: Record<AnatomicalDirection, 1 | -1> = {
  Left_to_right: 1,
  Right_to_left: -1,
  Posterior_to_anterior: 1,
  Anterior_to_posterior: -1,
  Inferior_to_superior: 1,
  Superior_to_inferior: -1
};

/** Letter naming each direction's positive end, as `aind-data-schema` names coordinate systems. */
const DIRECTION_LETTERS: Record<AnatomicalDirection, string> = {
  Left_to_right: "R",
  Right_to_left: "L",
  Posterior_to_anterior: "A",
  Anterior_to_posterior: "P",
  Inferior_to_superior: "S",
  Superior_to_inferior: "I"
};

/** Built-in position label message key per anatomical line, matching `aind-data-schema` axis names. */
const LINE_POSITION_MESSAGE_KEYS: Record<AnatomicalLine, string> = {
  leftRight: "axis.ml",
  posteriorAnterior: "axis.ap",
  inferiorSuperior: "axis.si"
};

/** Built-in rotation label message key per anatomical line a rotation turns about. */
const LINE_ROTATION_MESSAGE_KEYS: Record<AnatomicalLine, string> = {
  leftRight: "axis.pitch",
  posteriorAnterior: "axis.roll",
  inferiorSuperior: "axis.yaw"
};

/** Message key naming each direction in a direction picker. */
const DIRECTION_MESSAGE_KEYS: Record<AnatomicalDirection, string> = {
  Left_to_right: "direction.leftToRight",
  Right_to_left: "direction.rightToLeft",
  Posterior_to_anterior: "direction.posteriorToAnterior",
  Anterior_to_posterior: "direction.anteriorToPosterior",
  Inferior_to_superior: "direction.inferiorToSuperior",
  Superior_to_inferior: "direction.superiorToInferior"
};

/** How close a pitch may come to a pole before its yaw and roll collapse. */
const GIMBAL_TOLERANCE = 1e-9;

/** Global coordinate system new experiments start with: x right, y anterior, z superior. */
export function buildDefaultGlobalCoordinateSystem(): GlobalCoordinateSystem {
  return {
    axes: [
      buildCoordinateAxis("Left_to_right"),
      buildCoordinateAxis("Posterior_to_anterior"),
      buildCoordinateAxis("Inferior_to_superior")
    ],
    positionDisplayOrder: [...IDENTITY_AXIS_ORDER],
    rotationDisplayOrder: [...IDENTITY_AXIS_ORDER]
  };
}

/** Probe orientation new experiments start with: depth posterior, electrodes facing superior. */
export function buildDefaultLocalCoordinateSystem(): LocalCoordinateSystem {
  return {
    depthDirection: "Anterior_to_posterior",
    forwardDirection: "Inferior_to_superior"
  };
}

/**
 * Build a coordinate system axis that falls back to its built-in labels.
 * @param direction Direction the axis's positive values point.
 */
export function buildCoordinateAxis(
  direction: AnatomicalDirection
): CoordinateAxis {
  return { direction, positionName: "", rotationName: "" };
}

/**
 * Directions of a global coordinate system's axes, as conversions take them.
 * @param system Coordinate system to read.
 */
export function getAxisDirections(
  system: GlobalCoordinateSystem
): AxisDirections {
  return [
    system.axes[0].direction,
    system.axes[1].direction,
    system.axes[2].direction
  ];
}

/**
 * Anatomical line a direction runs along, which is what makes two directions
 * interchangeable and two axes parallel.
 * @param direction Direction to read.
 */
export function getDirectionLine(
  direction: AnatomicalDirection
): AnatomicalLine {
  return DIRECTION_LINES[direction];
}

/**
 * Unit vector of a direction, in canonical anatomical coordinates.
 * @param direction Direction to convert.
 */
export function getDirectionVector(
  direction: AnatomicalDirection
): [number, number, number] {
  const vector: [number, number, number] = [0, 0, 0];
  vector[LINE_CANONICAL_INDEXES[DIRECTION_LINES[direction]]] =
    DIRECTION_SIGNS[direction];
  return vector;
}

/**
 * Direction an axis-aligned canonical anatomical vector points, or null when it
 * points along no single axis.
 * @param vector Vector in canonical anatomical coordinates.
 */
export function getVectorDirection(
  vector: [number, number, number]
): AnatomicalDirection | null {
  return (
    ANATOMICAL_DIRECTIONS.find(direction => {
      const candidate = getDirectionVector(direction);
      return (
        candidate[0] === vector[0] &&
        candidate[1] === vector[1] &&
        candidate[2] === vector[2]
      );
    }) ?? null
  );
}

/**
 * Whether an axis triple uses each anatomical line exactly once, which every
 * conversion relies on.
 * @param directions Axis directions to check.
 */
export function isOrthogonalAxisDirections(
  directions: AxisDirections
): boolean {
  return (
    new Set(directions.map(direction => DIRECTION_LINES[direction])).size === 3
  );
}

/**
 * Index of the axis running along an anatomical line.
 * @param directions Axis directions to search.
 * @param line Anatomical line to find.
 */
export function getLineAxisIndex(
  directions: AxisDirections,
  line: AnatomicalLine
): AxisIndex {
  return directions.findIndex(
    direction => DIRECTION_LINES[direction] === line
  ) as AxisIndex;
}

/**
 * Name of a coordinate system, as the letters its axes' positive ends point to,
 * e.g. `RAS`, following the `aind-data-schema` naming convention.
 * @param directions Axis directions to name.
 */
export function getAxisDirectionsName(directions: AxisDirections): string {
  return directions.map(direction => DIRECTION_LETTERS[direction]).join("");
}

/**
 * Handedness a triple of axis directions implies, using the
 * `aind-data-schema` `Handedness` values.
 * @param directions Axis directions to measure.
 */
export function getAxisDirectionsHandedness(
  directions: AxisDirections
): "right" | "left" {
  const basis = getBasisMatrix(directions);
  const determinant =
    basis[0]! * (basis[4]! * basis[8]! - basis[5]! * basis[7]!) -
    basis[1]! * (basis[3]! * basis[8]! - basis[5]! * basis[6]!) +
    basis[2]! * (basis[3]! * basis[7]! - basis[4]! * basis[6]!);
  return determinant > 0 ? "right" : "left";
}

/**
 * Built-in label message key for positions along an axis.
 * @param direction Direction of the axis.
 */
export function getPositionAxisMessageKey(
  direction: AnatomicalDirection
): string {
  return LINE_POSITION_MESSAGE_KEYS[DIRECTION_LINES[direction]];
}

/**
 * Built-in label message key for rotations about an axis.
 * @param direction Direction of the axis.
 */
export function getRotationAxisMessageKey(
  direction: AnatomicalDirection
): string {
  return LINE_ROTATION_MESSAGE_KEYS[DIRECTION_LINES[direction]];
}

/**
 * Message key naming a direction in a direction picker.
 * @param direction Direction to name.
 */
export function getDirectionMessageKey(direction: AnatomicalDirection): string {
  return DIRECTION_MESSAGE_KEYS[direction];
}

/**
 * Re-express a coordinate in another frame's axes.
 * @param from Axis directions the coordinate is in.
 * @param to Axis directions to convert into.
 * @param coordinate Coordinate to convert.
 */
export function convertCoordinate(
  from: AxisDirections,
  to: AxisDirections,
  coordinate: [number, number, number]
): [number, number, number] {
  const converted: [number, number, number] = [0, 0, 0];
  for (let target = 0; target < 3; target += 1) {
    const targetDirection = to[target]!;
    const source = getLineAxisIndex(from, DIRECTION_LINES[targetDirection]);
    converted[target] =
      DIRECTION_SIGNS[targetDirection] *
      DIRECTION_SIGNS[from[source]!] *
      coordinate[source]!;
  }
  return converted;
}

/**
 * Re-express an axis-wise magnitude, such as a scale, in another frame's axes,
 * permuting the values without changing their signs.
 * @param from Axis directions the magnitudes are in.
 * @param to Axis directions to convert into.
 * @param magnitudes Magnitudes to convert.
 */
export function convertMagnitudes(
  from: AxisDirections,
  to: AxisDirections,
  magnitudes: [number, number, number]
): [number, number, number] {
  const converted: [number, number, number] = [0, 0, 0];
  for (let target = 0; target < 3; target += 1) {
    const source = getLineAxisIndex(from, DIRECTION_LINES[to[target]!]);
    converted[target] = magnitudes[source]!;
  }
  return converted;
}

/**
 * Basis of a frame: the matrix whose columns are its axes' canonical unit
 * vectors, mapping the frame's own coordinates into canonical anatomical ones.
 * @param directions Axis directions of the frame.
 */
export function getBasisMatrix(directions: AxisDirections): Matrix3 {
  const matrix: Matrix3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let column = 0; column < 3; column += 1) {
    const direction = directions[column]!;
    matrix[LINE_CANONICAL_INDEXES[DIRECTION_LINES[direction]] * 3 + column] =
      DIRECTION_SIGNS[direction];
  }
  return matrix;
}

/**
 * Rotation matrix of a rotation triple, in canonical anatomical coordinates.
 * Each value turns right-handed about its own axis, composed as a stereotaxic
 * manipulator moves: the roll about the posterior-anterior line applies first,
 * so it spins a resting probe about its own shank, then the pitch about the
 * left-right line tilts it, then the yaw about the inferior-superior line swings
 * the tilted probe about the vertical.
 * @param directions Axis directions the values turn about.
 * @param radians Rotation value per axis, in radians.
 */
export function getRotationMatrix(
  directions: AxisDirections,
  radians: [number, number, number]
): Matrix3 {
  const yaw = getCanonicalRotation(
    2,
    getLineAngle(directions, radians, "inferiorSuperior")
  );
  const pitch = getCanonicalRotation(
    0,
    getLineAngle(directions, radians, "leftRight")
  );
  const roll = getCanonicalRotation(
    1,
    getLineAngle(directions, radians, "posteriorAnterior")
  );
  return multiplyMatrices(yaw, multiplyMatrices(pitch, roll));
}

/**
 * Rotation triple a canonical anatomical rotation matrix decomposes into,
 * inverting `getRotationMatrix`. A probe pitched to a pole has its yaw and roll
 * turning about one and the same axis, so the roll collapses onto the yaw.
 * @param directions Axis directions the values turn about.
 * @param matrix Rotation matrix in canonical anatomical coordinates.
 */
export function getRotationTriple(
  directions: AxisDirections,
  matrix: Matrix3
): [number, number, number] {
  const pitch = Math.asin(Math.min(1, Math.max(-1, matrix[7]!)));
  const isAtPole = Math.abs(matrix[7]!) > 1 - GIMBAL_TOLERANCE;
  const yaw = isAtPole
    ? Math.atan2(Math.sign(matrix[7]!) * matrix[2]!, matrix[0]!)
    : Math.atan2(-matrix[1]!, matrix[4]!);
  const roll = isAtPole ? 0 : Math.atan2(-matrix[6]!, matrix[8]!);

  const radians: [number, number, number] = [0, 0, 0];
  setLineAngle(directions, radians, "inferiorSuperior", yaw);
  setLineAngle(directions, radians, "leftRight", pitch);
  setLineAngle(directions, radians, "posteriorAnterior", roll);
  return radians;
}

/**
 * Re-express a rotation triple in another frame's axes.
 * @param from Axis directions the values turn about.
 * @param to Axis directions to convert into.
 * @param radians Rotation value per axis, in radians.
 */
export function convertRotation(
  from: AxisDirections,
  to: AxisDirections,
  radians: [number, number, number]
): [number, number, number] {
  return getRotationTriple(to, getRotationMatrix(from, radians));
}

/**
 * Direction a probe's right axis points at rest, which follows from its depth
 * and forward directions, or null when those two are parallel.
 * @param system Local coordinate system to read.
 */
export function getRightDirection(
  system: LocalCoordinateSystem
): AnatomicalDirection | null {
  return getVectorDirection(
    crossProduct(
      getDirectionVector(system.depthDirection),
      getDirectionVector(system.forwardDirection)
    )
  );
}

/**
 * Whether a local coordinate system's depth and forward axes are
 * perpendicular, which a probe orientation relies on.
 * @param system Local coordinate system to check.
 */
export function isOrthogonalLocalCoordinateSystem(
  system: LocalCoordinateSystem
): boolean {
  return (
    DIRECTION_LINES[system.depthDirection] !==
    DIRECTION_LINES[system.forwardDirection]
  );
}

/**
 * Orientation a probe's body rests in, in canonical anatomical coordinates. The
 * body's axes are the ones its meshes are built in: x is the probe's right, y
 * is opposite the electrode face, and z runs up from the tip. Body x follows
 * the scene's own x, which runs along the atlas's left-to-right axis, so the
 * body frame is left handed exactly as the scene frame is, and this matrix is
 * orthonormal rather than a pure rotation.
 * @param system Local coordinate system the probe rests in.
 */
export function getProbeRestRotation(system: LocalCoordinateSystem): Matrix3 {
  const depth = getDirectionVector(system.depthDirection);
  const forward = getDirectionVector(system.forwardDirection);
  const right = crossProduct(depth, forward);
  return buildColumnMatrix(
    right,
    [-forward[0], -forward[1], -forward[2]],
    [-depth[0], -depth[1], -depth[2]]
  );
}

/**
 * Orientation a probe's transform chain starts in, in canonical anatomical
 * coordinates: the probe's body frame turned a half turn about its own x, so
 * the chain's third axis is the probe's depth axis and a chain's depth value
 * drives the probe deeper whatever the local coordinate system is.
 * @param system Local coordinate system the probe rests in.
 */
export function getChainRestRotation(system: LocalCoordinateSystem): Matrix3 {
  const depth = getDirectionVector(system.depthDirection);
  const forward = getDirectionVector(system.forwardDirection);
  return buildColumnMatrix(crossProduct(depth, forward), forward, depth);
}

/**
 * Rotation triple that points a probe's depth axis as far inferior as one
 * quarter turn can, which is where a new probe starts. The turn is a pitch about
 * the left-right line, or a roll about the posterior-anterior line when the
 * depth axis runs along the left-right line and a pitch could not move it.
 * @param global Global coordinate system the values turn about.
 * @param local Local coordinate system the probe rests in.
 */
export function getDownwardProbeRotation(
  global: GlobalCoordinateSystem,
  local: LocalCoordinateSystem
): [number, number, number] {
  const directions = getAxisDirections(global);
  const depthLine = DIRECTION_LINES[local.depthDirection];
  const turnLine: AnatomicalLine =
    depthLine === "leftRight" ? "posteriorAnterior" : "leftRight";
  const turnIndex = getLineAxisIndex(directions, turnLine);
  const turnSign = DIRECTION_SIGNS[directions[turnIndex]!];
  const canonicalTurnAxis = LINE_CANONICAL_INDEXES[turnLine];
  const depth = getDirectionVector(local.depthDirection);

  let downward: [number, number, number] = [0, 0, 0];
  let mostInferior = -Infinity;
  for (const quarterTurns of [0, 1, 2, 3]) {
    const radians: [number, number, number] = [0, 0, 0];
    radians[turnIndex] = (quarterTurns * Math.PI) / 2;
    const rotated = transformVector(
      getCanonicalRotation(canonicalTurnAxis, turnSign * radians[turnIndex]),
      depth
    );
    // Canonical z points superior, so the most inferior depth is the lowest z.
    if (-rotated[2] > mostInferior) {
      mostInferior = -rotated[2];
      downward = radians;
    }
  }
  return downward;
}

/**
 * Re-express an orientation, i.e. a matrix mapping a body's own axes into
 * canonical anatomical coordinates, in a frame's coordinates, so it can drive
 * that frame's transforms.
 * @param directions Axis directions of the frame.
 * @param orientation Orientation in canonical anatomical coordinates.
 */
export function getOrientationInFrame(
  directions: AxisDirections,
  orientation: Matrix3
): Matrix3 {
  return multiplyMatrices(
    transposeMatrix(getBasisMatrix(directions)),
    orientation
  );
}

/**
 * Re-express an orientation read out of a frame's transforms in canonical
 * anatomical coordinates.
 * @param directions Axis directions of the frame.
 * @param orientation Orientation in the frame's own coordinates.
 */
export function getOrientationFromFrame(
  directions: AxisDirections,
  orientation: Matrix3
): Matrix3 {
  return multiplyMatrices(getBasisMatrix(directions), orientation);
}

/**
 * Product of two matrices.
 * @param left Left matrix.
 * @param right Right matrix.
 */
export function multiplyMatrices(left: Matrix3, right: Matrix3): Matrix3 {
  const product: Matrix3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      product[row * 3 + column] =
        left[row * 3]! * right[column]! +
        left[row * 3 + 1]! * right[3 + column]! +
        left[row * 3 + 2]! * right[6 + column]!;
    }
  }
  return product;
}

/**
 * Transpose of a matrix, which inverts a rotation and a basis alike.
 * @param matrix Matrix to transpose.
 */
export function transposeMatrix(matrix: Matrix3): Matrix3 {
  return [
    matrix[0],
    matrix[3],
    matrix[6],
    matrix[1],
    matrix[4],
    matrix[7],
    matrix[2],
    matrix[5],
    matrix[8]
  ];
}

/**
 * Vector transformed by a matrix.
 * @param matrix Matrix to apply.
 * @param vector Vector to transform.
 */
export function transformVector(
  matrix: Matrix3,
  vector: [number, number, number]
): [number, number, number] {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2]
  ];
}

/**
 * Check that a value has the shape of a `GlobalCoordinateSystem`.
 * @param value Value to check.
 */
export function isGlobalCoordinateSystem(
  value: unknown
): value is GlobalCoordinateSystem {
  if (!isRecord(value)) return false;
  const { axes, positionDisplayOrder, rotationDisplayOrder } = value;
  if (!Array.isArray(axes) || axes.length !== 3) return false;
  if (!axes.every(isCoordinateAxis)) return false;
  if (
    !isOrthogonalAxisDirections(
      axes.map(axis => axis.direction) as AxisDirections
    )
  ) {
    return false;
  }
  return isAxisOrder(positionDisplayOrder) && isAxisOrder(rotationDisplayOrder);
}

/**
 * Check that a value has the shape of a `LocalCoordinateSystem`.
 * @param value Value to check.
 */
export function isLocalCoordinateSystem(
  value: unknown
): value is LocalCoordinateSystem {
  if (!isRecord(value)) return false;
  const { depthDirection, forwardDirection } = value;
  return (
    isAnatomicalDirection(depthDirection) &&
    isAnatomicalDirection(forwardDirection) &&
    DIRECTION_LINES[depthDirection] !== DIRECTION_LINES[forwardDirection]
  );
}

/**
 * Check that a value is an anatomical direction.
 * @param value Value to check.
 */
export function isAnatomicalDirection(
  value: unknown
): value is AnatomicalDirection {
  return (
    typeof value === "string" &&
    ANATOMICAL_DIRECTIONS.includes(value as AnatomicalDirection)
  );
}

/**
 * Check that a value has the shape of a `CoordinateAxis`.
 * @param value Value to check.
 */
function isCoordinateAxis(value: unknown): value is CoordinateAxis {
  if (!isRecord(value)) return false;
  return (
    isAnatomicalDirection(value.direction) &&
    typeof value.positionName === "string" &&
    typeof value.rotationName === "string"
  );
}

/**
 * Rotation value about an anatomical line, signed so it turns right-handed
 * about the canonical axis rather than about the frame's own axis.
 * @param directions Axis directions the values turn about.
 * @param radians Rotation value per axis, in radians.
 * @param line Anatomical line to read.
 */
function getLineAngle(
  directions: AxisDirections,
  radians: [number, number, number],
  line: AnatomicalLine
): number {
  const index = getLineAxisIndex(directions, line);
  return DIRECTION_SIGNS[directions[index]!] * radians[index]!;
}

/**
 * Write a canonical rotation value back onto the axis running along an
 * anatomical line, in place.
 * @param directions Axis directions the values turn about.
 * @param radians Rotation values to write, mutated in place.
 * @param line Anatomical line to write.
 * @param angle Canonical rotation value, in radians.
 */
function setLineAngle(
  directions: AxisDirections,
  radians: [number, number, number],
  line: AnatomicalLine,
  angle: number
): void {
  const index = getLineAxisIndex(directions, line);
  radians[index] = DIRECTION_SIGNS[directions[index]!] * angle;
}

/**
 * Right-handed rotation about one canonical anatomical axis.
 * @param axis Canonical axis index to turn about.
 * @param radians Angle to turn, in radians.
 */
function getCanonicalRotation(axis: AxisIndex, radians: number): Matrix3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  if (axis === 0) return [1, 0, 0, 0, cosine, -sine, 0, sine, cosine];
  if (axis === 1) return [cosine, 0, sine, 0, 1, 0, -sine, 0, cosine];
  return [cosine, -sine, 0, sine, cosine, 0, 0, 0, 1];
}

/**
 * Matrix whose columns are the given vectors, i.e. the basis they span.
 * @param first First column.
 * @param second Second column.
 * @param third Third column.
 */
function buildColumnMatrix(
  first: [number, number, number],
  second: [number, number, number],
  third: [number, number, number]
): Matrix3 {
  return [
    first[0],
    second[0],
    third[0],
    first[1],
    second[1],
    third[1],
    first[2],
    second[2],
    third[2]
  ];
}

/**
 * Cross product of two vectors.
 * @param left Left vector.
 * @param right Right vector.
 */
function crossProduct(
  left: [number, number, number],
  right: [number, number, number]
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}
