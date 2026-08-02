import { describe, expect, it, vi } from "vitest";
import { createApp, nextTick, ref, type Ref } from "vue";
import type { SampleResult } from "../models/sample-result.model";
import { useSliceCanvasPainter } from "./useSliceCanvasPainter";

function makeResult(
  sizePixels: number,
  overrides: Partial<SampleResult> = {}
): SampleResult {
  return {
    sampleCount: sizePixels * sizePixels,
    annotationValues: new Uint32Array(sizePixels * sizePixels),
    pixels: new Uint8ClampedArray(sizePixels * sizePixels * 4),
    paintedChunkCount: 1,
    totalChunkCount: 1,
    ...overrides
  };
}

/** Mount a throwaway component so `onMounted`/`watch` have a scope to run in. */
function mountWithPainter(
  canvas: Ref<HTMLCanvasElement | null>,
  result: Ref<SampleResult | null>,
  probeId: Ref<string>
): { unmount: () => void } {
  const app = createApp({
    setup() {
      useSliceCanvasPainter(canvas, result, probeId);
      return () => null;
    }
  });
  app.mount(document.createElement("div"));
  return { unmount: () => app.unmount() };
}

function makeCanvasStub(): HTMLCanvasElement & {
  context: {
    clearRect: ReturnType<typeof vi.fn>;
    putImageData: ReturnType<typeof vi.fn>;
  };
} {
  const context = { clearRect: vi.fn(), putImageData: vi.fn() };
  return {
    width: 0,
    height: 0,
    getContext: () => context,
    context
  } as unknown as HTMLCanvasElement & { context: typeof context };
}

describe("useSliceCanvasPainter", () => {
  it("paints once a result streams in, once mounted", async () => {
    const canvas = ref(makeCanvasStub());
    const result = ref<SampleResult | null>(null);
    const probeId = ref("probe-a");
    const { unmount } = mountWithPainter(canvas, result, probeId);
    await nextTick();

    result.value = makeResult(2);
    await nextTick();

    expect(canvas.value.context.putImageData).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("clears the canvas when the probe changes", async () => {
    const canvas = ref(makeCanvasStub());
    const result = ref<SampleResult | null>(makeResult(2));
    const probeId = ref("probe-a");
    const { unmount } = mountWithPainter(canvas, result, probeId);
    await nextTick();

    probeId.value = "probe-b";
    await nextTick();

    expect(canvas.value.context.clearRect).toHaveBeenCalled();
    unmount();
  });

  it("skips repainting a partial update once a complete image for the same probe is held", async () => {
    const canvas = ref(makeCanvasStub());
    const result = ref<SampleResult | null>(
      makeResult(2, { paintedChunkCount: 1, totalChunkCount: 1 })
    );
    const probeId = ref("probe-a");
    const { unmount } = mountWithPainter(canvas, result, probeId);
    await nextTick();

    const paintedBefore = canvas.value.context.putImageData.mock.calls.length;
    result.value = makeResult(2, { paintedChunkCount: 1, totalChunkCount: 3 });
    await nextTick();

    expect(canvas.value.context.putImageData.mock.calls.length).toBe(
      paintedBefore
    );
    unmount();
  });

  it("clears the canvas when the result becomes null", async () => {
    const canvas = ref(makeCanvasStub());
    const result = ref<SampleResult | null>(makeResult(2));
    const probeId = ref("probe-a");
    const { unmount } = mountWithPainter(canvas, result, probeId);
    await nextTick();

    result.value = null;
    await nextTick();

    expect(canvas.value.context.clearRect).toHaveBeenCalled();
    unmount();
  });
});
