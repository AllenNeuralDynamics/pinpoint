import { Matrix } from "@babylonjs/core";
import type { IMatrixLike, Scene, TransformNode } from "@babylonjs/core";
import { TextRenderer } from "@babylonjs/addons";
import type { FontAsset, INodeLike, ParagraphOptions } from "@babylonjs/addons";
import {
  GIMBAL_AXIS_COLORS,
  GIMBAL_AXIS_DIRECTIONS
} from "./coordinate-system-gimbal.api";
import { labelSizeEm } from "./axis-guide.api";

/** MSDF text renderer surface a gimbal axis label drives. */
export interface GimbalAxisLabelTextRenderer {
  parent: INodeLike | null;
  addParagraph(
    text: string,
    options?: Partial<ParagraphOptions>,
    worldMatrix?: IMatrixLike
  ): void;
  clearParagraphs(): void;
}

/** One text renderer per Babylon axis, plus the per-frame draw hook. */
export interface GimbalAxisLabels {
  renderers: [
    GimbalAxisLabelTextRenderer,
    GimbalAxisLabelTextRenderer,
    GimbalAxisLabelTextRenderer
  ];
  /** Release the renderers and the per-frame draw hook. The font asset is the caller's. */
  dispose: () => void;
}

/** Single-character reference the label font size is pinned to, so a longer value name never shrinks it. */
const GIMBAL_AXIS_LABEL_SIZE_REFERENCE_TEXT = "X";
/** Reference glyph's width, as a fraction of the gimbal axis length. */
const GIMBAL_AXIS_LABEL_WIDTH_FRACTION = 0.6;
/** Gap between an axis tip and its label's near edge, in label em. */
const GIMBAL_AXIS_LABEL_GAP_EM = 0.2;

/**
 * Label orientation per Babylon axis, reusing `AXIS_GUIDE_LOCAL_SPECS`' positive-axis
 * convention: X and Y lie flat in the local X/Y plane, Z stands upright.
 */
const GIMBAL_AXIS_LABEL_ROTATIONS: [
  { pitch: number; yaw: number; roll: number },
  { pitch: number; yaw: number; roll: number },
  { pitch: number; yaw: number; roll: number }
] = [
  { pitch: Math.PI, yaw: 0, roll: -Math.PI / 2 },
  { pitch: 0, yaw: Math.PI, roll: 0 },
  { pitch: Math.PI / 2, yaw: 0, roll: 0 }
];

/**
 * Create one text renderer per gimbal axis, coloured like that axis's cylinder and drawn after
 * every frame. Borrows the axis guides' font asset, so no second MSDF fetch happens.
 * @param scene Scene the renderers draw in.
 * @param fontAsset Font asset the labels are drawn with, owned by the caller.
 */
export async function createGimbalAxisLabels(
  scene: Scene,
  fontAsset: FontAsset
): Promise<GimbalAxisLabels> {
  const engine = scene.getEngine();
  const renderers = (await Promise.all(
    GIMBAL_AXIS_COLORS.map(async color => {
      const renderer = await TextRenderer.CreateTextRendererAsync(
        fontAsset,
        engine
      );
      renderer.color = color.toColor4();
      return renderer;
    })
  )) as [TextRenderer, TextRenderer, TextRenderer];

  // Text renderers are not scene nodes, so Babylon never draws them: render each one after the
  // scene with the active camera's matrices. Skip a renderer with no paragraphs (`parent` nulled
  // by `clearGimbalAxisLabels`): `TextRenderer.render()` always issues a draw call, and Babylon's
  // engine falls back to a *non-instanced* draw of one quad when the instance count is 0,
  // redrawing a stale glyph instead of nothing.
  const observer = scene.onAfterRenderObservable.add(() => {
    const camera = scene.activeCamera;
    if (!camera) return;

    for (const renderer of renderers) {
      if (!renderer.parent) continue;
      renderer.render(camera.getViewMatrix(), camera.getProjectionMatrix());
    }
  });

  return {
    renderers,
    dispose: () => {
      observer.remove();
      for (const renderer of renderers) renderer.dispose();
    }
  };
}

/**
 * Draw one label at the tip of each of a gimbal's three axes, replacing any existing ones.
 * @param labels Text renderers to draw with.
 * @param gimbal Gimbal node whose axes are labelled; the labels follow it.
 * @param axisLength Length the gimbal's axis cylinders span, in mm.
 * @param texts Label text per Babylon axis.
 * @param fontAsset Font asset the labels are measured with.
 */
export function buildGimbalAxisLabels(
  labels: GimbalAxisLabels,
  gimbal: TransformNode,
  axisLength: number,
  texts: [string, string, string],
  fontAsset: FontAsset
): void {
  clearGimbalAxisLabels(labels);

  // Sized off a fixed single-glyph reference rather than the label text, so a longer value name
  // sits further along the axis instead of shrinking every label's font size.
  const referenceWidth = labelSizeEm(
    GIMBAL_AXIS_LABEL_SIZE_REFERENCE_TEXT,
    fontAsset
  ).width;
  // A font missing even the reference glyph measures 0 wide; scaling to it would be Infinity.
  if (referenceWidth === 0) return;

  const fontSize =
    (axisLength * GIMBAL_AXIS_LABEL_WIDTH_FRACTION) / referenceWidth;
  for (const [axis, direction] of GIMBAL_AXIS_DIRECTIONS.entries()) {
    const text = texts[axis]!;
    const size = labelSizeEm(text, fontAsset);
    const center = direction.scale(
      axisLength + (GIMBAL_AXIS_LABEL_GAP_EM + size.height / 2) * fontSize
    );
    const rotation = GIMBAL_AXIS_LABEL_ROTATIONS[axis]!;
    const renderer = labels.renderers[axis]!;
    renderer.parent = gimbal;
    renderer.addParagraph(
      text,
      undefined,
      Matrix.Scaling(fontSize, fontSize, 1)
        .multiply(
          Matrix.RotationYawPitchRoll(
            rotation.yaw,
            rotation.pitch,
            rotation.roll
          )
        )
        .multiply(Matrix.Translation(center.x, center.y, center.z))
    );
  }
}

/**
 * Drop every gimbal axis label, leaving the renderers loaded for the next draw.
 * @param labels Text renderers to clear.
 */
export function clearGimbalAxisLabels(labels: GimbalAxisLabels): void {
  for (const renderer of labels.renderers) {
    renderer.clearParagraphs();
    renderer.parent = null;
  }
}
