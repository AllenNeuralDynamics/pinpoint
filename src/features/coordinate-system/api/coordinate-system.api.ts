import type {
  CoordinateSystem,
  CoordinateSystemNode,
  CoordinateSystemNodeComponent,
  CoordinateSystemValue
} from "../model/coordinate-system.model";
import { isFiniteNumber, isRecord, isSafeObjectKey } from "@/utils/type-guards";

/**
 * Build an adjustable coordinate system value.
 * @param name Display name of the value.
 * @param bounds Inclusive range the value is limited to, or null for unbounded.
 * @param value Initial value.
 */
export function buildCoordinateSystemValue(
  name: string,
  bounds: [number, number] | null = null,
  value = 0
): CoordinateSystemValue {
  return { name, value, fixed: false, bounds };
}

/**
 * Build a fixed coordinate system value, which is always unbounded.
 * @param name Display name of the value.
 * @param value Fixed value.
 */
export function buildFixedCoordinateSystemValue(
  name = "",
  value = 0
): CoordinateSystemValue {
  return { name, value, fixed: true, bounds: null };
}

/**
 * Build a coordinate system chain node from its position and rotation values.
 * @param name Display name of the transform.
 * @param position Position values.
 * @param rotation Rotation values.
 * @param positionDisplayOrder Mapping from XYZ index to position value index.
 * @param rotationDisplayOrder Mapping from XYZ index to rotation value index.
 * @param onSurface Whether this node must reside on the surface of the brain.
 */
export function buildCoordinateSystemNode(
  name: string,
  position: [
    CoordinateSystemValue,
    CoordinateSystemValue,
    CoordinateSystemValue
  ],
  rotation: [
    CoordinateSystemValue,
    CoordinateSystemValue,
    CoordinateSystemValue
  ],
  positionDisplayOrder: [number, number, number] = [0, 1, 2],
  rotationDisplayOrder: [number, number, number] = [0, 1, 2],
  onSurface = false
): CoordinateSystemNode {
  return {
    name,
    position,
    positionDisplayOrder,
    rotation,
    rotationDisplayOrder,
    onSurface
  };
}

/**
 * Build a coordinate system with a fresh id.
 * @param name Display name of the coordinate system.
 * @param chain Transform chain, applied in order.
 * @param offsetByReferenceCoordinate Whether the chain is offset by the experiment reference coordinate.
 */
export function buildCoordinateSystem(
  name: string,
  chain: CoordinateSystemNode[],
  offsetByReferenceCoordinate = false
): CoordinateSystem {
  return {
    inspectableKind: "coordinateSystem",
    id: crypto.randomUUID(),
    name,
    offsetByReferenceCoordinate,
    chain
  };
}

/**
 * Identifier a coordinate system is interned and referenced under.
 * @param coordinateSystem Coordinate system to identify.
 */
export function getCoordinateSystemIdentifier(
  coordinateSystem: CoordinateSystem
): string {
  return coordinateSystem.id;
}

/**
 * Append an all-zero, unbounded, unfixed transform to a coordinate system's chain.
 * @param coordinateSystem Coordinate system to append to, mutated in place.
 * @param name Display name of the transform.
 */
export function addCoordinateSystemTransform(
  coordinateSystem: CoordinateSystem,
  name: string
): void {
  coordinateSystem.chain.push(
    buildCoordinateSystemNode(
      name,
      [
        buildCoordinateSystemValue("ML"),
        buildCoordinateSystemValue("DV"),
        buildCoordinateSystemValue("AP")
      ],
      [
        buildCoordinateSystemValue("Pitch"),
        buildCoordinateSystemValue("Yaw"),
        buildCoordinateSystemValue("Roll")
      ]
    )
  );
}

/**
 * Move a transform within a coordinate system's chain.
 * @param coordinateSystem Coordinate system holding the chain, mutated in place.
 * @param fromIndex Index of the transform to move.
 * @param toIndex Index to move it to.
 */
export function reorderCoordinateSystemTransform(
  coordinateSystem: CoordinateSystem,
  fromIndex: number,
  toIndex: number
): void {
  const { chain } = coordinateSystem;
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= chain.length ||
    toIndex >= chain.length
  ) {
    return;
  }
  const [node] = chain.splice(fromIndex, 1);
  chain.splice(toIndex, 0, node!);
}

/**
 * Remove one transform from a coordinate system's chain.
 * @param coordinateSystem Coordinate system holding the chain, mutated in place.
 * @param nodeIndex Index of the transform to remove.
 */
export function removeCoordinateSystemTransform(
  coordinateSystem: CoordinateSystem,
  nodeIndex: number
): void {
  const { chain } = coordinateSystem;
  if (nodeIndex < 0 || nodeIndex >= chain.length) return;
  chain.splice(nodeIndex, 1);
}

/**
 * Mark one node of a coordinate system's chain as its surface node, clearing every
 * other node so at most one is ever on the surface.
 * @param coordinateSystem Coordinate system holding the chain, mutated in place.
 * @param nodeIndex Index of the node to set or clear.
 * @param onSurface Whether that node is on the brain surface.
 */
export function setCoordinateSystemSurfaceNode(
  coordinateSystem: CoordinateSystem,
  nodeIndex: number,
  onSurface: boolean
): void {
  if (!onSurface) {
    const node = coordinateSystem.chain[nodeIndex];
    if (node) node.onSurface = false;
    return;
  }
  coordinateSystem.chain.forEach((node, index) => {
    node.onSurface = index === nodeIndex;
  });
}

/**
 * Axis index (0 = X, 1 = Y, 2 = Z) a node's value is mapped to, or -1 when absent.
 * @param node Coordinate system node holding the value.
 * @param component Whether the value is a position or a rotation value.
 * @param valueIndex Index of the value within its display-ordered triple.
 */
export function getCoordinateSystemValueAxis(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent,
  valueIndex: number
): number {
  const { order } = getComponentPair(node, component);
  return order.indexOf(valueIndex);
}

/**
 * Value mapped to a node's axis, with its fixed flag and bounds.
 * @param node Coordinate system node holding the value.
 * @param component Whether to read a position or a rotation value.
 * @param axisIndex Axis index (0 = X, 1 = Y, 2 = Z) to read.
 */
export function getCoordinateSystemAxisEntry(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent,
  axisIndex: number
): CoordinateSystemValue {
  const { values, order } = getComponentPair(node, component);
  return values[order[axisIndex]!]!;
}

/**
 * Read a node's value on the given axis.
 * @param node Coordinate system node holding the value.
 * @param component Whether to read a position or a rotation value.
 * @param axisIndex Axis index (0 = X, 1 = Y, 2 = Z) to read.
 */
export function getCoordinateSystemAxisValue(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent,
  axisIndex: number
): number {
  return getCoordinateSystemAxisEntry(node, component, axisIndex).value;
}

/**
 * Write a node's value on the given axis.
 * @param node Coordinate system node holding the value, mutated in place.
 * @param component Whether to write a position or a rotation value.
 * @param axisIndex Axis index (0 = X, 1 = Y, 2 = Z) to write.
 * @param value Value to assign.
 */
export function setCoordinateSystemAxisValue(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent,
  axisIndex: number,
  value: number
): void {
  getCoordinateSystemAxisEntry(node, component, axisIndex).value = value;
}

/**
 * Copy a solved chain's values into a chain of the same shape, in place.
 * @param chain Chain to write, mutated in place.
 * @param solved Chain to read values from, index-aligned with `chain`.
 */
export function applyCoordinateSystemChainValues(
  chain: CoordinateSystemNode[],
  solved: CoordinateSystemNode[]
): void {
  for (let index = 0; index < chain.length; index++) {
    const node = chain[index]!;
    const solvedNode = solved[index];
    if (!solvedNode) return;
    for (let valueIndex = 0; valueIndex < 3; valueIndex++) {
      node.position[valueIndex]!.value = solvedNode.position[valueIndex]!.value;
      node.rotation[valueIndex]!.value = solvedNode.rotation[valueIndex]!.value;
    }
  }
}

/**
 * Resolve a node's values array and display order for the given component.
 * @param node Coordinate system node holding the component.
 * @param component Whether to resolve the position or rotation pair.
 */
function getComponentPair(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent
): {
  values: [CoordinateSystemValue, CoordinateSystemValue, CoordinateSystemValue];
  order: [number, number, number];
} {
  return component === "position"
    ? { values: node.position, order: node.positionDisplayOrder }
    : { values: node.rotation, order: node.rotationDisplayOrder };
}

/**
 * Map a node's value onto an axis, swapping with the value that held it so the
 * three axes stay distinct.
 * @param node Coordinate system node holding the value.
 * @param component Whether the value is a position or a rotation value.
 * @param valueIndex Index of the value within its display-ordered triple.
 * @param axisIndex Axis index (0 = X, 1 = Y, 2 = Z) to map the value onto.
 */
export function setCoordinateSystemValueAxis(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent,
  valueIndex: number,
  axisIndex: number
): void {
  const { order } = getComponentPair(node, component);
  const currentAxis = order.indexOf(valueIndex);
  if (
    currentAxis === -1 ||
    currentAxis === axisIndex ||
    axisIndex < 0 ||
    axisIndex >= order.length
  ) {
    return;
  }
  order[currentAxis] = order[axisIndex]!;
  order[axisIndex] = valueIndex;
}

/**
 * Move a node's value within its display order, keeping every axis mapped to
 * the same value.
 * @param node Coordinate system node holding the value.
 * @param component Whether the value is a position or a rotation value.
 * @param fromIndex Index of the value to move.
 * @param toIndex Index to move it to.
 */
export function reorderCoordinateSystemValue(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent,
  fromIndex: number,
  toIndex: number
): void {
  const { values, order } = getComponentPair(node, component);
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= values.length ||
    toIndex >= values.length
  ) {
    return;
  }

  const newToOld = [0, 1, 2];
  newToOld.splice(toIndex, 0, ...newToOld.splice(fromIndex, 1));
  const oldToNew = [0, 0, 0];
  newToOld.forEach((oldIndex, newIndex) => (oldToNew[oldIndex] = newIndex));
  values.splice(toIndex, 0, ...values.splice(fromIndex, 1));
  for (let axis = 0; axis < order.length; axis++) {
    order[axis] = oldToNew[order[axis]!]!;
  }
}

/**
 * Fix or unfix a coordinate system value; a fixed value is always unbounded.
 * @param coordinateSystemValue Coordinate system value to update.
 * @param fixed Whether the value should be fixed.
 */
export function setCoordinateSystemValueFixed(
  coordinateSystemValue: CoordinateSystemValue,
  fixed: boolean
): void {
  coordinateSystemValue.fixed = fixed;
  if (fixed) coordinateSystemValue.bounds = null;
}

/** Half-width of the range a newly bounded value is seeded with, in its stored unit (mm or radians). */
const BOUNDS_SEED_HALF_WIDTH = 1;

/**
 * Bound or unbound a coordinate system value, seeding a new bound that brackets its current value.
 * @param coordinateSystemValue Coordinate system value to update.
 * @param bounded Whether the value should be bounded.
 */
export function setCoordinateSystemValueBounded(
  coordinateSystemValue: CoordinateSystemValue,
  bounded: boolean
): void {
  coordinateSystemValue.bounds = bounded
    ? [
        coordinateSystemValue.value - BOUNDS_SEED_HALF_WIDTH,
        coordinateSystemValue.value + BOUNDS_SEED_HALF_WIDTH
      ]
    : null;
}

/**
 * Check that a value has the shape of a `CoordinateSystem`.
 * @param value Value to check.
 */
export function isCoordinateSystem(value: unknown): value is CoordinateSystem {
  if (!isRecord(value)) return false;

  return (
    value.inspectableKind === "coordinateSystem" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isSafeObjectKey(value.id) &&
    typeof value.name === "string" &&
    typeof value.offsetByReferenceCoordinate === "boolean" &&
    Array.isArray(value.chain) &&
    value.chain.every(isCoordinateSystemNode)
  );
}

/**
 * Check that a value has the shape of a `CoordinateSystemNode`.
 * @param value Value to check.
 */
function isCoordinateSystemNode(value: unknown): value is CoordinateSystemNode {
  if (!isRecord(value)) return false;

  return (
    typeof value.name === "string" &&
    isCoordinateSystemValueTriple(value.position) &&
    isCoordinateSystemValueTriple(value.rotation) &&
    isAxisOrder(value.positionDisplayOrder) &&
    isAxisOrder(value.rotationDisplayOrder) &&
    typeof value.onSurface === "boolean"
  );
}

/**
 * Check that a value is a triple of coordinate system values.
 * @param value Value to check.
 */
function isCoordinateSystemValueTriple(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(isCoordinateSystemValue)
  );
}

/**
 * Check that a value has the shape of a `CoordinateSystemValue`.
 * @param value Value to check.
 */
function isCoordinateSystemValue(
  value: unknown
): value is CoordinateSystemValue {
  if (!isRecord(value)) return false;

  return (
    typeof value.name === "string" &&
    isFiniteNumber(value.value) &&
    typeof value.fixed === "boolean" &&
    (value.bounds === null ||
      (Array.isArray(value.bounds) &&
        value.bounds.length === 2 &&
        value.bounds.every(isFiniteNumber)))
  );
}

/**
 * Check that a value is a permutation of the three axis indexes, which every
 * axis lookup indexes blindly.
 * @param value Value to check.
 */
function isAxisOrder(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    [0, 1, 2].every(index => value.includes(index))
  );
}
