import { SSAO2RenderingPipeline } from "@babylonjs/core";
import type { ArcRotateCamera, Scene } from "@babylonjs/core";

/** Name the SSAO pipeline registers under in a scene's post-process pipeline manager. */
export const SSAO_PIPELINE_NAME = "ssao_pipeline";

/**
 * Longest dimension, in mm, of the Allen mouse 25 µm atlas (`0.025 mm × 528` voxels), the size at
 * which SSAO2's own `radius` and `maxZ` defaults are used unchanged.
 */
const SSAO_REFERENCE_ATLAS_MILLIMETERS = 13.2;

/** SSAO2's default occlusion radius, in mm, applied at the reference atlas size. */
const SSAO_REFERENCE_RADIUS = 2;

/** SSAO2's default depth cutoff, in mm, applied at the reference atlas size. */
const SSAO_REFERENCE_MAX_Z = 100;

/** Whether the current engine can run SSAO2, which needs WebGL 2 or WebGPU. */
export function isSsaoSupported(): boolean {
  return SSAO2RenderingPipeline.IsSupported;
}

/**
 * Attach a screen-space ambient occlusion pipeline to a scene's camera. Assumes the engine
 * supports it; check `isSsaoSupported` first.
 * @param scene Scene to add the pipeline to.
 * @param camera Camera the pipeline renders for.
 * @param ratio Size of the occlusion pass relative to the canvas, 0-1; the denoise pass stays
 * full size.
 */
export function attachSsaoPipeline(
  scene: Scene,
  camera: ArcRotateCamera,
  ratio: number
): SSAO2RenderingPipeline {
  return new SSAO2RenderingPipeline(
    SSAO_PIPELINE_NAME,
    scene,
    { ssaoRatio: ratio, blurRatio: 1 },
    [camera]
  );
}

/**
 * Scale a pipeline's occlusion radius and depth cutoff by the atlas's size relative to the Allen
 * mouse 25 µm atlas, so the effect reads the same on a 1 mm larva and a 180 mm human brain. Leaves
 * a zero-sized atlas alone.
 * @param pipeline Pipeline to scale.
 * @param longestDimensionMillimeters Longest dimension of the atlas being rendered, in mm.
 */
export function scaleSsaoToAtlas(
  pipeline: SSAO2RenderingPipeline,
  longestDimensionMillimeters: number
): void {
  if (longestDimensionMillimeters <= 0) return;

  const scale = longestDimensionMillimeters / SSAO_REFERENCE_ATLAS_MILLIMETERS;
  pipeline.radius = SSAO_REFERENCE_RADIUS * scale;
  pipeline.maxZ = SSAO_REFERENCE_MAX_Z * scale;
}

/**
 * Dispose an SSAO pipeline, detaching it and its post-processes from every camera.
 * @param pipeline Pipeline to dispose.
 */
export function detachSsaoPipeline(pipeline: SSAO2RenderingPipeline): void {
  pipeline.dispose();
}
