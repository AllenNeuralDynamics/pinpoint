import { describe, expect, it } from "vitest";
import { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { makeTestScene } from "@/test/mount-helper";
import {
  SSAO_PIPELINE_NAME,
  attachSsaoPipeline,
  detachSsaoPipeline,
  isSsaoSupported,
  scaleSsaoToAtlas
} from "./ssao.api";

describe("attachSsaoPipeline", () => {
  it("registers a pipeline under SSAO_PIPELINE_NAME", () => {
    const scene = makeTestScene();
    const camera = new ArcRotateCamera(
      "camera",
      0,
      0,
      10,
      Vector3.Zero(),
      scene
    );

    const pipeline = attachSsaoPipeline(scene, camera, 0.5);

    expect(
      scene.postProcessRenderPipelineManager.supportedPipelines.map(p => p.name)
    ).toEqual([SSAO_PIPELINE_NAME]);
    expect(pipeline.getClassName()).toBe("SSAO2RenderingPipeline");
  });
});

describe("detachSsaoPipeline", () => {
  it("removes the pipeline from the scene", () => {
    const scene = makeTestScene();
    const camera = new ArcRotateCamera(
      "camera",
      0,
      0,
      10,
      Vector3.Zero(),
      scene
    );
    const pipeline = attachSsaoPipeline(scene, camera, 0.5);

    detachSsaoPipeline(pipeline);

    expect(
      scene.postProcessRenderPipelineManager.supportedPipelines
    ).toHaveLength(0);
  });
});

describe("isSsaoSupported", () => {
  it("is false on an engine without WebGL 2", () => {
    // Constructing a scene makes its NullEngine the last created engine.
    makeTestScene();

    expect(isSsaoSupported()).toBe(false);
  });
});

describe("re-attaching after a detach", () => {
  it("succeeds under the same name at a different ratio", () => {
    const scene = makeTestScene();
    const camera = new ArcRotateCamera(
      "camera",
      0,
      0,
      10,
      Vector3.Zero(),
      scene
    );

    const first = attachSsaoPipeline(scene, camera, 0.5);
    detachSsaoPipeline(first);
    attachSsaoPipeline(scene, camera, 0.25);

    const pipelines = scene.postProcessRenderPipelineManager.supportedPipelines;
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0]!.name).toBe(SSAO_PIPELINE_NAME);
  });
});

describe("scaleSsaoToAtlas", () => {
  it("leaves SSAO2's defaults exactly in place at the reference atlas size", () => {
    const scene = makeTestScene();
    const camera = new ArcRotateCamera(
      "camera",
      0,
      0,
      10,
      Vector3.Zero(),
      scene
    );
    const pipeline = attachSsaoPipeline(scene, camera, 0.5);

    scaleSsaoToAtlas(pipeline, 13.2);

    expect(pipeline.radius).toBe(2);
    expect(pipeline.maxZ).toBe(100);
  });

  it("scales radius and maxZ linearly away from the reference atlas size", () => {
    const scene = makeTestScene();
    const camera = new ArcRotateCamera(
      "camera",
      0,
      0,
      10,
      Vector3.Zero(),
      scene
    );
    const pipeline = attachSsaoPipeline(scene, camera, 0.5);

    scaleSsaoToAtlas(pipeline, 26.4);

    expect(pipeline.radius).toBeCloseTo(4);
    expect(pipeline.maxZ).toBeCloseTo(200);
  });

  it("leaves a zero-sized atlas alone", () => {
    const scene = makeTestScene();
    const camera = new ArcRotateCamera(
      "camera",
      0,
      0,
      10,
      Vector3.Zero(),
      scene
    );
    const pipeline = attachSsaoPipeline(scene, camera, 0.5);
    const radiusBefore = pipeline.radius;
    const maxZBefore = pipeline.maxZ;

    scaleSsaoToAtlas(pipeline, 0);

    expect(pipeline.radius).toBe(radiusBefore);
    expect(pipeline.maxZ).toBe(maxZBefore);
    expect(pipeline.radius).toBe(2);
    expect(pipeline.maxZ).toBe(100);
  });
});
