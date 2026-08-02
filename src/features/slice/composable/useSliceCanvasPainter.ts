import { onMounted, type Ref, watch } from "vue";
import {
  getSampleEdgeLength,
  isSampleResultComplete
} from "../api/sample-result.api";
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

  function clearCanvas(): void {
    const element = canvas.value;
    paintedProbeId = null;
    if (!element) return;

    const context = element.getContext("2d");
    context?.clearRect(0, 0, element.width, element.height);
  }

  /**
   * Paint the current result, unless it's a partial update at a resolution
   * the canvas already holds a complete image for and the same probe -
   * preserving that image avoids a flicker to empty between geometry updates.
   */
  function drawSlice(): void {
    const element = canvas.value;
    const slice = result.value;
    if (!element || !slice?.pixels) return;

    const size = getSampleEdgeLength(slice);
    const isCanvasCurrent =
      element.width === size && paintedProbeId === probeId.value;
    if (isCanvasCurrent && !isSampleResultComplete(slice)) return;

    if (element.width !== size) {
      element.width = size;
      element.height = size;
    }

    const context = element.getContext("2d");
    if (!context) return;
    // `SampleResult.pixels` is declared as a plain `Uint8ClampedArray`, which
    // TS's newer typed-array generics widen to `ArrayBufferLike` (a superset
    // that also covers SharedArrayBuffer); `ImageData` only accepts the
    // narrower `ArrayBuffer`-backed variant, so this is a type-only mismatch.
    const pixels = slice.pixels as Uint8ClampedArray<ArrayBuffer>;
    context.putImageData(new ImageData(pixels, size, size), 0, 0);
    paintedProbeId = probeId.value;
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
