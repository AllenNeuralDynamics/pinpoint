import { onMounted, type Ref, watch } from "vue";
import { isSampleResultComplete } from "../api/sample-result.api";
import type { SampleResult } from "../models/sample-result.model";

/**
 * Paint a stream of sample results onto a canvas as they arrive, preserving
 * the last complete image across partial updates and clearing it when the
 * probe changes.
 * @param canvas Canvas element to paint into.
 * @param result Sample result to paint, or null to clear.
 * @param probeId Id of the probe the canvas is currently showing.
 */
export function useSliceCanvasPainter(
  canvas: Ref<HTMLCanvasElement | null>,
  result: Ref<SampleResult | null>,
  probeId: Ref<string>
): void {
  /** Id of the probe the canvas currently holds a painted (or in-progress) image for. */
  let paintedProbeId: string | null = null;
  /** Whether the canvas currently holds a fully painted image. */
  let hasCompleteImage = false;

  function clearCanvas(): void {
    const element = canvas.value;
    paintedProbeId = null;
    hasCompleteImage = false;
    if (!element) return;

    const context = element.getContext("2d");
    context?.clearRect(0, 0, element.width, element.height);
  }

  /**
   * Paint the current result, unless it's a partial update and the canvas
   * already holds a complete image for the same probe - preserving that
   * image avoids a flicker to empty between geometry updates.
   */
  function drawSlice(): void {
    const element = canvas.value;
    const slice = result.value;
    if (!element || !slice) return;

    const { widthPixels, heightPixels } = slice;
    const isComplete = isSampleResultComplete(slice);
    // A partial update is skipped whenever the canvas already holds a complete
    // image for this probe, at any resolution - so the image held during
    // movement stays up until its replacement finishes instead of flashing
    // empty when the sampling resolution changes.
    if (hasCompleteImage && paintedProbeId === probeId.value && !isComplete) {
      return;
    }

    if (element.width !== widthPixels || element.height !== heightPixels) {
      element.width = widthPixels;
      element.height = heightPixels;
    }

    const context = element.getContext("2d");
    if (!context) return;
    context.putImageData(
      new ImageData(slice.pixels, widthPixels, heightPixels),
      0,
      0
    );
    paintedProbeId = probeId.value;
    hasCompleteImage = isComplete;
  }

  // `flush: "post"` and the `onMounted` call both exist for the same reason:
  // a result can already be published (the sampler's shared worker pool and
  // open volume persist across mounts) before this component's canvas ref is
  // set, e.g. right after switching the selected probe - without repainting
  // once mounted, that already-sampled result would never reach the screen.
  watch(result, value => (value ? drawSlice() : clearCanvas()), {
    flush: "post"
  });
  onMounted(drawSlice);

  // The canvas is reused across probe switches, so the previous probe's
  // image must be explicitly invalidated - otherwise it would linger under
  // the newly selected probe until a new result streams in.
  watch(probeId, clearCanvas);
}
