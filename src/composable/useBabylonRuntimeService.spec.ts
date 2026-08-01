import { describe, expect, it } from "vitest";
import { createApp } from "vue";
import { useBabylonRuntimeService } from "./useBabylonRuntimeService";
import type { BabylonRuntimeService } from "@/services/babylon-runtime.service";
import { BabylonRuntimeServiceKey } from "@/services/babylon-runtime.service";

/**
 * Run the composable inside an app's injection context. `runWithContext` is
 * used instead of mounting a host component so that a throw from the
 * composable surfaces as a plain exception, rather than going through Vue's
 * `setup` error handling.
 * @param runtime Runtime service to provide, or nothing to leave it absent.
 */
function withRuntimeContext(runtime?: BabylonRuntimeService) {
  const app = createApp({ render: () => null });
  if (runtime) app.provide(BabylonRuntimeServiceKey, runtime);
  return app.runWithContext(() => useBabylonRuntimeService());
}

describe("useBabylonRuntimeService", () => {
  it("throws when no runtime service has been provided", () => {
    expect(() => withRuntimeContext()).toThrow(
      "Babylon runtime service was not provided."
    );
  });

  it("returns the provided runtime service", () => {
    const runtime = { init: () => {}, dispose: () => {} } as never;

    expect(withRuntimeContext(runtime)).toBe(runtime);
  });
});
