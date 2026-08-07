import { describe, expect, it } from "vitest";
import { TransformNode, Vector3 } from "@babylonjs/core";
import {
  buildReferenceCoordinateNode,
  referenceRelativeToWorld,
  setReferenceCoordinateNodePosition,
  worldToReferenceRelative
} from "./reference-coordinate.api";
import { asrToVector3 } from "./coordinate-transforms.api";
import { setAtlasCenterOffset } from "./structures.api";
import { getAtlasCenter } from "@/features/atlas";
import { makeAtlas } from "@/test/fixtures";
import { makeTestScene } from "@/test/mount-helper";

describe("buildReferenceCoordinateNode", () => {
  it("creates the reference coordinate node parented to the atlas root", () => {
    const scene = makeTestScene();

    const node = buildReferenceCoordinateNode(scene);

    expect(node.name).toBe("referenceCoordinate_node");
    expect(node.parent!.name).toBe("atlasRoot_node");
  });

  it("creates the atlas root node when it doesn't yet exist", () => {
    const scene = makeTestScene();

    buildReferenceCoordinateNode(scene);

    const atlasRootNode = scene.getTransformNodeByName("atlasRoot_node");
    expect(atlasRootNode).not.toBeNull();
    expect(atlasRootNode!.rotation.equals(new Vector3(Math.PI, 0, 0))).toBe(
      true
    );
  });

  it("returns the existing node on a second call rather than duplicating it", () => {
    const scene = makeTestScene();

    const first = buildReferenceCoordinateNode(scene);
    const second = buildReferenceCoordinateNode(scene);

    expect(second).toBe(first);
    expect(
      scene.transformNodes.filter(
        node => node.name === "referenceCoordinate_node"
      )
    ).toHaveLength(1);
  });
});

describe("setReferenceCoordinateNodePosition", () => {
  it("positions the node at the given reference coordinate", () => {
    const scene = makeTestScene();

    setReferenceCoordinateNodePosition(scene, [5.7, 0.44, 5.4]);

    const node = scene.getTransformNodeByName("referenceCoordinate_node")!;
    expect(node.position.equals(asrToVector3([5.7, 0.44, 5.4]))).toBe(true);
  });

  it("creates the node when the scene has none yet", () => {
    const scene = makeTestScene();

    setReferenceCoordinateNodePosition(scene, [1, 2, 3]);

    expect(
      scene.getTransformNodeByName("referenceCoordinate_node")
    ).not.toBeNull();
  });

  it("moves the existing node on a later call instead of creating another", () => {
    const scene = makeTestScene();
    setReferenceCoordinateNodePosition(scene, [1, 2, 3]);
    const node = scene.getTransformNodeByName("referenceCoordinate_node")!;

    setReferenceCoordinateNodePosition(scene, [4, 5, 6]);

    expect(scene.getTransformNodeByName("referenceCoordinate_node")).toBe(node);
    expect(node.position.equals(asrToVector3([4, 5, 6]))).toBe(true);
  });
});

describe("referenceRelativeToWorld / worldToReferenceRelative round-trip", () => {
  const atlas = makeAtlas();
  const referenceCoordinate: [number, number, number] = [5.7, 0.44, 5.4];

  it("round-trips a relative coordinate through world space", () => {
    const relativeCoordinate: [number, number, number] = [1, 2, 3];

    const world = referenceRelativeToWorld(
      atlas,
      referenceCoordinate,
      relativeCoordinate
    );
    const roundTripped = worldToReferenceRelative(
      atlas,
      referenceCoordinate,
      world
    );

    expect(roundTripped).toEqual(relativeCoordinate);
  });

  it("matches where the real scene hierarchy places the reference-relative coordinate", () => {
    const scene = makeTestScene();
    setAtlasCenterOffset(scene, getAtlasCenter(atlas));
    setReferenceCoordinateNodePosition(scene, referenceCoordinate);
    const relativeCoordinate: [number, number, number] = [1, 2, 3];
    const child = new TransformNode("child", scene);
    child.parent = buildReferenceCoordinateNode(scene);
    child.position = asrToVector3(relativeCoordinate);
    child.computeWorldMatrix(true);

    const expectedWorld = referenceRelativeToWorld(
      atlas,
      referenceCoordinate,
      relativeCoordinate
    );

    // The arithmetic shortcut derives world position from the atlas centre
    // directly; this pins it to the real node hierarchy `setAtlasCenterOffset`
    // and `setReferenceCoordinateNodePosition` build.
    expect(
      Vector3.Distance(child.absolutePosition, expectedWorld)
    ).toBeLessThan(1e-6);
  });
});
