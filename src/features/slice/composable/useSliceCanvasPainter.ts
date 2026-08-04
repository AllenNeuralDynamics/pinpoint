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

  /** Clear the canvas and forget which probe it was holding an image for. */
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

    if (hasCompleteImage && paintedProbeId === probeId.value && !isComplete) {
      return;
    }

    if (element.width !== widthPixels || element.height !== heightPixels) {
      element.width = widthPixels;
      element.height = heightPixels;
    }

    const context = element.getContext("2d");
    if (!context) return;
    context.putImageData(slice.imageData, 0, 0);
    paintedProbeId = probeId.value;
    hasCompleteImage = isComplete;
  }

  // `flush: "post"` + `onMounted`: repaints an already-published result that arrived before this canvas mounted.
  watch(result, value => (value ? drawSlice() : clearCanvas()), {
    flush: "post"
  });
  onMounted(drawSlice);

  // Reused across probe switches: explicitly invalidate the previous probe's image.
  watch(probeId, clearCanvas);
}
