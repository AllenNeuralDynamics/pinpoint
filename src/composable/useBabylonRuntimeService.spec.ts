import { describe, expect, it } from "vitest";
import { createApp } from "vue";
import { useBabylonRuntimeService } from "./useBabylonRuntimeService";
import { BabylonRuntimeServiceKey } from "@/services/babylon-runtime.service";

/**
 * Mount a throwaway component that calls the composable in its `setup`, so
 * `inject` runs inside a real component context.
 */
function mountWithComposable() {
  const app = createApp({
    setup() {
      useBabylonRuntimeService();
      return () => null;
    }
  });
  app.mount(document.createElement("div"));
}

describe("useBabylonRuntimeService", () => {
  it("throws when no runtime service has been provided", () => {
    expect(() => mountWithComposable()).toThrow(
      "Babylon runtime service was not provided."
    );
  });

  it("returns the provided runtime service", () => {
    const runtime = { init: () => {}, dispose: () => {} };
    let result: unknown;

    const app = createApp({
      setup() {
        result = useBabylonRuntimeService();
        return () => null;
      }
    });
    app.provide(BabylonRuntimeServiceKey, runtime as never);
    app.mount(document.createElement("div"));

    expect(result).toBe(runtime);
  });
});
