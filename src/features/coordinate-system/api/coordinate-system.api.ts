import type {
  CoordinateSystem,
  CoordinateSystemNode,
  CoordinateSystemNodeComponent,
  CoordinateSystemValue,
  CoordinateSystemValueMode
} from "../model/coordinate-system.model";
import {
  type AxisIndex,
  type AxisOrder,
  isAxisOrder,
  moveAxisSlot
} from "@/utils/axis-order";
import { isFiniteNumber, isRecord, isSafeObjectKey } from "@/utils/type-guards";

/**
 * Build a coordinate system value.
 * @param name Display name of the value.
 * @param value Initial value.
 * @param mode How the solver treats the value.
 */
export function buildCoordinateSystemValue(
  name: string,
  value = 0,
  mode: CoordinateSystemValueMode = "free"
): CoordinateSystemValue {
  return { name, value, mode };
}

/**
 * Build a fixed coordinate system value, which the solver treats as a rigid constant.
 * @param name Display name of the value.
 * @param value Fixed value.
 */
export function buildFixedCoordinateSystemValue(
  name = "",
  value = 0
): CoordinateSystemValue {
  return buildCoordinateSystemValue(name, value, "fixed");
}

/**
 * Build a coordinate system chain node from its position and rotation values.
 * @param name Display name of the transform.
 * @param position Position values.
 * @param rotation Rotation values.
 * @param positionDisplayOrder Display slot to axis index mapping.
 * @param rotationDisplayOrder Display slot to axis index mapping.
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
  positionDisplayOrder: AxisOrder = [0, 1, 2],
  rotationDisplayOrder: AxisOrder = [0, 1, 2],
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
 * Append an all-zero, all-free transform to a coordinate system's chain.
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
 * A node's values in display order, each paired with the axis it drives.
 * @param node Coordinate system node to read.
 * @param component Whether to read the position or the rotation triple.
 */
export function getCoordinateSystemSlots(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent
): { axis: AxisIndex; value: CoordinateSystemValue }[] {
  const { values, order } = getComponentPair(node, component);
  return order.map(axis => ({ axis, value: values[axis]! }));
}

/**
 * Value mapped to a node's axis, with its name and mode.
 * @param node Coordinate system node holding the value.
 * @param component Whether to read a position or a rotation value.
 * @param axisIndex Axis index (0 = X, 1 = Y, 2 = Z) to read.
 */
export function getCoordinateSystemAxisEntry(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent,
  axisIndex: number
): CoordinateSystemValue {
  return getComponentPair(node, component).values[axisIndex]!;
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
  order: AxisOrder;
} {
  return component === "position"
    ? { values: node.position, order: node.positionDisplayOrder }
    : { values: node.rotation, order: node.rotationDisplayOrder };
}

/**
 * Map a display slot onto an axis, swapping values with whichever slot held
 * that axis, so each slot's own name and value stay with it rather than
 * following the axis.
 * @param node Coordinate system node holding the value.
 * @param component Whether the value is a position or a rotation value.
 * @param slotIndex Display slot to remap.
 * @param axisIndex Axis index (0 = X, 1 = Y, 2 = Z) to map the slot onto.
 */
export function setCoordinateSystemSlotAxis(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent,
  slotIndex: number,
  axisIndex: number
): void {
  const { values, order } = getComponentPair(node, component);
  const otherSlot = order.indexOf(axisIndex as AxisIndex);
  if (
    slotIndex < 0 ||
    slotIndex > 2 ||
    otherSlot === -1 ||
    otherSlot === slotIndex
  ) {
    return;
  }
  const currentAxis = order[slotIndex]!;
  [values[currentAxis], values[axisIndex]] = [
    values[axisIndex]!,
    values[currentAxis]!
  ];
  order[slotIndex] = axisIndex as AxisIndex;
  order[otherSlot] = currentAxis;
}

/**
 * Move a display slot within a node's order, keeping every axis mapped to
 * the same value.
 * @param node Coordinate system node holding the value.
 * @param component Whether the value is a position or a rotation value.
 * @param fromSlot Slot to move.
 * @param toSlot Slot to move it to.
 */
export function reorderCoordinateSystemSlot(
  node: CoordinateSystemNode,
  component: CoordinateSystemNodeComponent,
  fromSlot: number,
  toSlot: number
): void {
  moveAxisSlot(getComponentPair(node, component).order, fromSlot, toSlot);
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

/** Every valid coordinate system value mode, for the type guard's membership check. */
const COORDINATE_SYSTEM_VALUE_MODES: CoordinateSystemValueMode[] = [
  "free",
  "fixed",
  "user"
];

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
    COORDINATE_SYSTEM_VALUE_MODES.includes(
      value.mode as CoordinateSystemValueMode
    )
  );
}
