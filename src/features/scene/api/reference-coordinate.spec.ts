import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import {
  buildReferenceCoordinateNode,
  setReferenceCoordinateNodePosition
} from "./reference-coordinate.api";
import { asrToVector3 } from "./coordinate-transforms.api";
import { buildExperiment } from "@/features/experiment";
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
  it("positions the node at the experiment's reference coordinate", () => {
    const scene = makeTestScene();
    const experiment = buildExperiment(
      "experiment",
      makeAtlas(),
      [5.7, 0.44, 5.4]
    );

    setReferenceCoordinateNodePosition(scene, experiment);

    const node = scene.getTransformNodeByName("referenceCoordinate_node")!;
    expect(
      node.position.equals(asrToVector3(experiment.referenceCoordinate))
    ).toBe(true);
  });

  it("creates the node when the scene has none yet", () => {
    const scene = makeTestScene();
    const experiment = buildExperiment("experiment", makeAtlas(), [1, 2, 3]);

    setReferenceCoordinateNodePosition(scene, experiment);

    expect(
      scene.getTransformNodeByName("referenceCoordinate_node")
    ).not.toBeNull();
  });

  it("moves the existing node on a later call instead of creating another", () => {
    const scene = makeTestScene();
    const experiment = buildExperiment("experiment", makeAtlas(), [1, 2, 3]);
    setReferenceCoordinateNodePosition(scene, experiment);
    const node = scene.getTransformNodeByName("referenceCoordinate_node")!;

    experiment.referenceCoordinate = [4, 5, 6];
    setReferenceCoordinateNodePosition(scene, experiment);

    expect(scene.getTransformNodeByName("referenceCoordinate_node")).toBe(node);
    expect(node.position.equals(asrToVector3([4, 5, 6]))).toBe(true);
  });
});
