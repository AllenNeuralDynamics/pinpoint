import { describe, expect, it } from "vitest";
import { TransformNode } from "@babylonjs/core";
import {
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem
} from "@/utils/coordinate-frame";
import { makeTestSceneWithGizmo } from "@/test/mount-helper";
import {
  buildCoordinateGizmos,
  disposeCoordinateGizmos,
  setCoordinateGizmoMode,
  trackCoordinateGizmoAttachment
} from "./coordinate-gizmo.api";
import {
  getGlobalFrameAxes,
  getLocalFrameAxes,
  getNodeFrameAxes
} from "./frame-axes.api";

/** Labels the specs pass through; the gizmo itself draws no text. */
const LABELS: [string, string, string] = ["First", "Second", "Third"];

/**
 * Build the three gizmos on a fresh test scene, along the global frame unless a
 * probe-local one is asked for.
 * @param isLocal Whether to build along a probe's local coordinate system.
 */
function makeGizmos(isLocal = false) {
  const { scene, gizmoManager } = makeTestSceneWithGizmo();
  const frame = isLocal
    ? getLocalFrameAxes(buildDefaultLocalCoordinateSystem(), LABELS)
    : getGlobalFrameAxes(buildDefaultGlobalCoordinateSystem(), LABELS);
  const gizmos = buildCoordinateGizmos(
    gizmoManager,
    frame,
    getNodeFrameAxes(LABELS)
  );
  return { scene, gizmoManager, gizmos };
}

describe("buildCoordinateGizmos", () => {
  it("turns Babylon's own composite gizmos off, since their axes are fixed", () => {
    const { gizmoManager } = makeGizmos();

    expect(gizmoManager.positionGizmoEnabled).toBe(false);
    expect(gizmoManager.rotationGizmoEnabled).toBe(false);
    expect(gizmoManager.scaleGizmoEnabled).toBe(false);
  });

  it("starts hidden and detached until a mode is chosen", () => {
    const { gizmos } = makeGizmos();

    for (const gizmo of Object.values(gizmos)) {
      expect(gizmo.isEnabled).toBe(false);
    }
  });

  it("adopts the node the manager already holds", () => {
    const { scene, gizmoManager } = makeTestSceneWithGizmo();
    const node = new TransformNode("target_node", scene);
    gizmoManager.attachToNode(node);

    const gizmos = buildCoordinateGizmos(
      gizmoManager,
      getGlobalFrameAxes(buildDefaultGlobalCoordinateSystem(), LABELS),
      getNodeFrameAxes(LABELS)
    );

    expect(gizmos.positionGizmo.attachedNode).toBe(node);
  });
});

describe("setCoordinateGizmoMode", () => {
  it("shows exactly one gizmo", () => {
    const { gizmos } = makeGizmos();

    setCoordinateGizmoMode(gizmos, "rotation");

    expect(gizmos.positionGizmo.isEnabled).toBe(false);
    expect(gizmos.rotationGizmo.isEnabled).toBe(true);
    expect(gizmos.scaleGizmo.isEnabled).toBe(false);
  });

  it("keeps a hidden gizmo detached, so its handles cannot be dragged", () => {
    const { scene, gizmoManager, gizmos } = makeGizmos();
    const node = new TransformNode("target_node", scene);

    setCoordinateGizmoMode(gizmos, "position");
    gizmoManager.attachToNode(node);
    trackCoordinateGizmoAttachment(gizmoManager, gizmos);
    gizmoManager.attachToNode(node);

    expect(gizmos.positionGizmo.attachedNode).toBe(node);

    setCoordinateGizmoMode(gizmos, "rotation");

    expect(gizmos.rotationGizmo.attachedNode).toBe(node);
    // Still remembered, but the handles themselves are detached while hidden.
    expect(gizmos.positionGizmo.attachedNode).toBe(node);
    expect(gizmos.positionGizmo.isEnabled).toBe(false);
  });
});

describe("trackCoordinateGizmoAttachment", () => {
  it("moves every gizmo onto whatever the manager attaches", () => {
    const { scene, gizmoManager, gizmos } = makeGizmos();
    const first = new TransformNode("first_node", scene);
    const second = new TransformNode("second_node", scene);
    trackCoordinateGizmoAttachment(gizmoManager, gizmos);

    gizmoManager.attachToNode(first);
    expect(gizmos.rotationGizmo.attachedNode).toBe(first);

    gizmoManager.attachToNode(second);
    expect(gizmos.rotationGizmo.attachedNode).toBe(second);

    gizmoManager.attachToNode(null);
    expect(gizmos.rotationGizmo.attachedNode).toBeNull();
  });

  it("stops tracking once its observers are removed", () => {
    const { scene, gizmoManager, gizmos } = makeGizmos();
    const node = new TransformNode("target_node", scene);

    for (const observer of trackCoordinateGizmoAttachment(
      gizmoManager,
      gizmos
    )) {
      observer.remove();
    }
    gizmoManager.attachToNode(node);

    expect(gizmos.positionGizmo.attachedNode).toBeNull();
  });
});

describe("disposeCoordinateGizmos", () => {
  it("removes every handle mesh from the scene", () => {
    const { gizmoManager, gizmos } = makeGizmos();
    const layer = gizmoManager.utilityLayer.utilityLayerScene;
    const built = layer.meshes.length;

    disposeCoordinateGizmos(gizmos);

    expect(built).toBeGreaterThan(0);
    expect(layer.meshes.length).toBeLessThan(built);
  });

  it("silences the drag observables", () => {
    const { gizmos } = makeGizmos();
    let drags = 0;
    gizmos.positionGizmo.onDragObservable.add(() => {
      drags += 1;
    });

    disposeCoordinateGizmos(gizmos);
    gizmos.positionGizmo.onDragObservable.notifyObservers();

    expect(drags).toBe(0);
  });
});

describe("drag observables", () => {
  it("reports drags for either frame, since only the axes differ", () => {
    for (const isLocal of [false, true]) {
      const { gizmos } = makeGizmos(isLocal);
      const seen: string[] = [];
      gizmos.positionGizmo.onDragStartObservable.add(() => seen.push("start"));
      gizmos.positionGizmo.onDragObservable.add(() => seen.push("drag"));
      gizmos.positionGizmo.onDragEndObservable.add(() => seen.push("end"));

      gizmos.positionGizmo.onDragStartObservable.notifyObservers();
      gizmos.positionGizmo.onDragObservable.notifyObservers();
      gizmos.positionGizmo.onDragEndObservable.notifyObservers();

      expect(seen).toEqual(["start", "drag", "end"]);
    }
  });
});
