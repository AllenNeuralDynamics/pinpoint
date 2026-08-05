import { describe, expect, it } from "vitest";
import { TransformNode, Vector3 } from "@babylonjs/core";
import { makeTestScene, tickScene } from "@/test/mount-helper";
import {
  interpolateNodePose,
  isNodePoseInterpolating,
  stopNodePoseInterpolation
} from "./pose-interpolation.api";

describe("interpolateNodePose", () => {
  it("eases in, then out", () => {
    const scene = makeTestScene();
    const node = new TransformNode("n", scene);
    interpolateNodePose(scene, node, {
      position: new Vector3(10, 0, 0),
      rotation: Vector3.Zero()
    });

    tickScene(scene, 50);
    expect(node.position.x).toBeCloseTo(1.5625);

    const scene2 = makeTestScene();
    const node2 = new TransformNode("n2", scene2);
    interpolateNodePose(scene2, node2, {
      position: new Vector3(10, 0, 0),
      rotation: Vector3.Zero()
    });

    tickScene(scene2, 150);
    expect(node2.position.x).toBeCloseTo(8.4375);
  });

  it("lands exactly on the goal after 0.2 s and detaches", () => {
    const scene = makeTestScene();
    const node = new TransformNode("n", scene);
    const goal = new Vector3(10, 0, 0);
    interpolateNodePose(scene, node, {
      position: goal,
      rotation: Vector3.Zero()
    });

    tickScene(scene, 100);
    tickScene(scene, 100);

    expect(node.position.asArray()).toEqual(goal.asArray());
    expect(isNodePoseInterpolating(node)).toBe(false);

    node.position.set(0, 0, 0);
    tickScene(scene, 100);

    expect(node.position.asArray()).toEqual([0, 0, 0]);
  });

  it("animates rotation alongside position", () => {
    const scene = makeTestScene();
    const node = new TransformNode("n", scene);
    interpolateNodePose(scene, node, {
      position: Vector3.Zero(),
      rotation: new Vector3(0, 0, 1)
    });

    tickScene(scene, 100);
    expect(node.rotation.z).toBeCloseTo(0.5);

    tickScene(scene, 100);
    expect(node.rotation.asArray()).toEqual([0, 0, 1]);
  });

  it("rotates the short way around a wrap", () => {
    const scene = makeTestScene();
    const node = new TransformNode("n", scene);
    node.rotation = new Vector3(0, 0, -3);
    interpolateNodePose(scene, node, {
      position: Vector3.Zero(),
      rotation: new Vector3(0, 0, 3)
    });

    tickScene(scene, 100);

    const worldRight = Vector3.TransformNormal(
      Vector3.Right(),
      node.computeWorldMatrix(true)
    );
    expect(worldRight.x).toBeCloseTo(-1, 4);
  });

  it("restarts from the current pose instead of stacking", () => {
    const scene = makeTestScene();
    const node = new TransformNode("n", scene);
    interpolateNodePose(scene, node, {
      position: new Vector3(10, 0, 0),
      rotation: Vector3.Zero()
    });
    tickScene(scene, 100);
    expect(node.position.x).toBeCloseTo(5);

    interpolateNodePose(scene, node, {
      position: new Vector3(0, 0, 20),
      rotation: Vector3.Zero()
    });
    tickScene(scene, 100);

    expect(node.position.x).toBeCloseTo(2.5);
    expect(node.position.z).toBeCloseTo(10);

    tickScene(scene, 100);

    expect(node.position.asArray()).toEqual([0, 0, 20]);
  });

  it("self-detaches on a disposed node", () => {
    const scene = makeTestScene();
    const node = new TransformNode("n", scene);
    interpolateNodePose(scene, node, {
      position: new Vector3(10, 0, 0),
      rotation: Vector3.Zero()
    });

    node.dispose();

    expect(() => tickScene(scene, 100)).not.toThrow();
    expect(isNodePoseInterpolating(node)).toBe(false);
  });
});

describe("stopNodePoseInterpolation", () => {
  it("freezes the current pose", () => {
    const scene = makeTestScene();
    const node = new TransformNode("n", scene);
    interpolateNodePose(scene, node, {
      position: new Vector3(10, 0, 0),
      rotation: Vector3.Zero()
    });
    tickScene(scene, 100);
    expect(node.position.x).toBeCloseTo(5);

    stopNodePoseInterpolation(node);
    tickScene(scene, 100);

    expect(node.position.x).toBeCloseTo(5);
  });
});
