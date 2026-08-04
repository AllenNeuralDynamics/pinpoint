import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, ref, type Ref } from "vue";
import { useMotionResolutionScale } from "./useMotionResolutionScale";

/** Mount a throwaway component so `watch` has a scope to run in. */
function mountWithScale(motionKey: Ref<string>): {
  scale: Readonly<Ref<number>>;
  unmount: () => void;
} {
  let scale!: Readonly<Ref<number>>;
  const app = createApp({
    setup() {
      scale = useMotionResolutionScale(motionKey);
      return () => null;
    }
  });
  app.mount(document.createElement("div"));
  return { scale, unmount: () => app.unmount() };
}

describe("useMotionResolutionScale", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays at 1 for a single, isolated change", async () => {
    const key = ref("a");
    const { scale, unmount } = mountWithScale(key);

    key.value = "b";
    await nextTick();
    vi.advanceTimersByTime(500);

    expect(scale.value).toBe(1);
    unmount();
  });

  it("drops to the motion scale once a second change lands inside the window", async () => {
    const key = ref("a");
    const { scale, unmount } = mountWithScale(key);

    key.value = "b";
    await nextTick();
    key.value = "c";
    await nextTick();

    expect(scale.value).toBe(0.25);
    unmount();
  });

  it("stays at 1 when two changes are farther apart than the window", async () => {
    const key = ref("a");
    const { scale, unmount } = mountWithScale(key);

    key.value = "b";
    await nextTick();
    vi.advanceTimersByTime(150);
    key.value = "c";
    await nextTick();

    expect(scale.value).toBe(1);
    unmount();
  });

  it("returns to 1 once movement settles", async () => {
    const key = ref("a");
    const { scale, unmount } = mountWithScale(key);

    key.value = "b";
    await nextTick();
    key.value = "c";
    await nextTick();
    expect(scale.value).toBe(0.25);

    vi.advanceTimersByTime(150);

    expect(scale.value).toBe(1);
    unmount();
  });

  it("slides the settle window on every change while still moving", async () => {
    const key = ref("a");
    const { scale, unmount } = mountWithScale(key);

    key.value = "b";
    await nextTick();
    key.value = "c";
    await nextTick();
    expect(scale.value).toBe(0.25);

    // Halfway to settling, another change arrives and restarts the 150ms
    // settle window; by the time the *original* window would have elapsed
    // (50 + 100 = 150ms total), the slid window (50 + 150ms) has not.
    vi.advanceTimersByTime(50);
    key.value = "d";
    await nextTick();
    vi.advanceTimersByTime(100);

    expect(scale.value).toBe(0.25);
    unmount();
  });
});
