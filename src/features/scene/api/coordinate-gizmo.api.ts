import {
  AxisDragGizmo,
  AxisScaleGizmo,
  Observable,
  PlaneRotationGizmo
} from "@babylonjs/core";
import type {
  Color3,
  GizmoManager,
  Node,
  Nullable,
  Observer,
  Vector3
} from "@babylonjs/core";
import type { CoordinateFrame } from "../models/frame-axis.model";
import type { CoordinateGizmos, GizmoMode } from "../models/gizmo.model";

/** How thick a gizmo's handles are drawn, matching Babylon's own default. */
const GIZMO_THICKNESS = 1;

/** How many segments a rotation handle's ring is drawn with. */
const ROTATION_TESSELLATION = 32;

/**
 * One transform gizmo, whose three handles are drawn and dragged along a
 * coordinate frame's own axes.
 */
export interface CoordinateGizmo {
  /** Node the handles drag, or null while nothing is attached. */
  attachedNode: Nullable<Node>;
  /** Fires when a handle starts being dragged. */
  onDragStartObservable: Observable<void>;
  /** Fires while a handle is dragged. */
  onDragObservable: Observable<void>;
  /** Fires when a handle stops being dragged. */
  onDragEndObservable: Observable<void>;
  /** Whether the gizmo's handles are shown and pickable. */
  isEnabled: boolean;
  dispose(): void;
}

/**
 * Build the three transform gizmos along a coordinate frame's axes, keeping
 * them attached to whatever node the gizmo manager holds. Babylon's own
 * composite gizmos are turned off: their handles are locked to the node's or
 * the world's x, y and z, which a user-defined coordinate system need not
 * match, and no node rotation can express a left-handed frame.
 * @param gizmoManager Gizmo manager whose layers and attachment the gizmos follow.
 * @param frame Frame the position and rotation handles are drawn along.
 * @param scaleFrame Frame the scale handles are drawn along, always node-local.
 */
export function buildCoordinateGizmos(
  gizmoManager: GizmoManager,
  frame: CoordinateFrame,
  scaleFrame: CoordinateFrame
): CoordinateGizmos {
  gizmoManager.positionGizmoEnabled = false;
  gizmoManager.rotationGizmoEnabled = false;
  gizmoManager.scaleGizmoEnabled = false;

  const gizmos: CoordinateGizmos = {
    positionGizmo: buildAxisGizmos(gizmoManager, frame, "position"),
    rotationGizmo: buildAxisGizmos(gizmoManager, frame, "rotation"),
    scaleGizmo: buildAxisGizmos(gizmoManager, scaleFrame, "scale")
  };

  for (const gizmo of Object.values(gizmos)) {
    gizmo.attachedNode = gizmoManager.attachedNode;
  }

  return gizmos;
}

/**
 * Follow a gizmo manager's attachment onto the given gizmos, so selecting an
 * entity moves the handles onto it. Only node attachment is followed: the app
 * attaches through `attachToNode` and leaves the manager's pointer attaching
 * with no attachable meshes.
 * @param gizmoManager Gizmo manager to follow.
 * @param gizmos Gizmos to attach, mutated as the attachment changes.
 */
export function trackCoordinateGizmoAttachment(
  gizmoManager: GizmoManager,
  gizmos: CoordinateGizmos
): Observer<Nullable<Node>>[] {
  return [
    gizmoManager.onAttachedToNodeObservable.add(node => {
      for (const gizmo of Object.values(gizmos)) gizmo.attachedNode = node;
    })
  ];
}

/**
 * Show exactly one of the three transform gizmos.
 * @param gizmos Gizmos to switch between.
 * @param mode Transform gizmo to show; the other two are hidden, not disposed.
 */
export function setCoordinateGizmoMode(
  gizmos: CoordinateGizmos,
  mode: GizmoMode
): void {
  gizmos.positionGizmo.isEnabled = mode === "position";
  gizmos.rotationGizmo.isEnabled = mode === "rotation";
  gizmos.scaleGizmo.isEnabled = mode === "scale";
}

/**
 * Dispose the three transform gizmos and their handles.
 * @param gizmos Gizmos to dispose.
 */
export function disposeCoordinateGizmos(gizmos: CoordinateGizmos): void {
  for (const gizmo of Object.values(gizmos)) gizmo.dispose();
}

/**
 * Build one transform gizmo as three independent handles, one per frame axis.
 * Independent handles are what makes an arbitrary frame exact: each carries its
 * own direction and colour, so the three need not form a right-handed basis.
 * @param gizmoManager Gizmo manager whose layers the handles render on.
 * @param frame Frame the handles are drawn along.
 * @param mode Which kind of handle to build.
 */
function buildAxisGizmos(
  gizmoManager: GizmoManager,
  frame: CoordinateFrame,
  mode: GizmoMode
): CoordinateGizmo {
  const onDragStartObservable = new Observable<void>();
  const onDragObservable = new Observable<void>();
  const onDragEndObservable = new Observable<void>();

  const handles = frame.axes.map(axis => {
    const handle = buildHandle(gizmoManager, axis.direction, axis.color, mode);
    handle.updateGizmoRotationToMatchAttachedMesh = frame.isNodeLocal;
    handle.dragBehavior.onDragStartObservable.add(() =>
      onDragStartObservable.notifyObservers()
    );
    handle.dragBehavior.onDragObservable.add(() =>
      onDragObservable.notifyObservers()
    );
    handle.dragBehavior.onDragEndObservable.add(() =>
      onDragEndObservable.notifyObservers()
    );
    return handle;
  });

  let attachedNode: Nullable<Node> = null;
  let isEnabled = false;

  return {
    onDragStartObservable,
    onDragObservable,
    onDragEndObservable,

    get attachedNode() {
      return attachedNode;
    },
    set attachedNode(node: Nullable<Node>) {
      attachedNode = node;
      // A hidden gizmo stays detached, so its handles never pick or drag.
      for (const handle of handles)
        handle.attachedNode = isEnabled ? node : null;
    },

    get isEnabled() {
      return isEnabled;
    },
    set isEnabled(value: boolean) {
      isEnabled = value;
      for (const handle of handles) {
        handle.isEnabled = value;
        handle.attachedNode = value ? attachedNode : null;
      }
    },

    dispose() {
      for (const handle of handles) handle.dispose();
      onDragStartObservable.clear();
      onDragObservable.clear();
      onDragEndObservable.clear();
    }
  };
}

/**
 * Build one handle of a transform gizmo along a single direction.
 * @param gizmoManager Gizmo manager whose layers the handle renders on.
 * @param direction Direction the handle drags, or turns about for a rotation.
 * @param color Colour to draw the handle in.
 * @param mode Which kind of handle to build.
 */
function buildHandle(
  gizmoManager: GizmoManager,
  direction: Vector3,
  color: Color3,
  mode: GizmoMode
): AxisDragGizmo | PlaneRotationGizmo | AxisScaleGizmo {
  if (mode === "position") {
    return new AxisDragGizmo(
      direction,
      color,
      gizmoManager.utilityLayer,
      null,
      GIZMO_THICKNESS
    );
  }
  if (mode === "rotation") {
    // Rotation handles render on the depth-keeping layer, as Babylon's own
    // rotation gizmo does, so the ring behind the entity stays visible.
    return new PlaneRotationGizmo(
      direction,
      color,
      gizmoManager.keepDepthUtilityLayer,
      ROTATION_TESSELLATION,
      null,
      false,
      GIZMO_THICKNESS
    );
  }
  return new AxisScaleGizmo(
    direction,
    color,
    gizmoManager.utilityLayer,
    null,
    GIZMO_THICKNESS
  );
}
