/** One editable degree of freedom within a coordinate system node. */
export interface CoordinateSystemValue {
  name: string;
  value: number;
  fixed: boolean;

  /** Ignored if `fixed` is true. Null means unbounded. */
  bounds: [number, number] | null;
}
/** One transform, position and rotation, in a coordinate system chain. */
export interface CoordinateSystemNode {
  /** User-facing label for this transform, e.g. `Depth`. */
  name: string;

  position: [
    CoordinateSystemValue,
    CoordinateSystemValue,
    CoordinateSystemValue
  ];

  /** Mapping from XYZ index to a coordinate system value index. */
  positionDisplayOrder: [number, number, number];

  rotation: [
    CoordinateSystemValue,
    CoordinateSystemValue,
    CoordinateSystemValue
  ];

  /** Mapping from XYZ index to a coordinate system value index. */
  rotationDisplayOrder: [number, number, number];

  /** If this node is on the surface of the brain. */
  onSurface: boolean;
}

/** Which triple of a coordinate system node a value belongs to. */
export type CoordinateSystemNodeComponent = "position" | "rotation";

/** An ordered chain of transforms mapping a probe's degrees of freedom to its tip pose. */
export interface CoordinateSystem {
  inspectableKind: "coordinateSystem";
  id: string;
  name: string;

  /** If the whole chain is offset by the experiment's reference coordinate. */
  offsetByReferenceCoordinate: boolean;
  chain: CoordinateSystemNode[];
}
