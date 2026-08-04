import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useDelayedFlag } from "./useDelayedFlag";

describe("useDelayedFlag", () => {
  it("stays false while the source has been true for less than the delay", async () => {
    vi.useFakeTimers();
    try {
      const source = ref(false);
      const delayed = useDelayedFlag(source, 500);

      source.value = true;
      await nextTick();
      vi.advanceTimersByTime(499);

      expect(delayed.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flips on once the source has stayed true for the full delay", async () => {
    vi.useFakeTimers();
    try {
      const source = ref(false);
      const delayed = useDelayedFlag(source, 500);

      source.value = true;
      await nextTick();
      vi.advanceTimersByTime(500);

      expect(delayed.value).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending flip when the source goes false before the delay elapses", async () => {
    vi.useFakeTimers();
    try {
      const source = ref(false);
      const delayed = useDelayedFlag(source, 500);

      source.value = true;
      await nextTick();
      vi.advanceTimersByTime(200);
      source.value = false;
      await nextTick();
      vi.advanceTimersByTime(500);

      expect(delayed.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns off immediately once the source goes false after flipping on", async () => {
    vi.useFakeTimers();
    try {
      const source = ref(false);
      const delayed = useDelayedFlag(source, 500);

      source.value = true;
      await nextTick();
      vi.advanceTimersByTime(500);
      expect(delayed.value).toBe(true);

      source.value = false;
      await nextTick();
      expect(delayed.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
