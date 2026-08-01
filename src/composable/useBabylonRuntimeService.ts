import { inject } from "vue";
import { BabylonRuntimeServiceKey } from "@/services/babylon-runtime.service";

/**
 * Inject the Babylon runtime service and return it.
 *
 * @throws Error if the injection doesn't return something.
 */
export function useBabylonRuntimeService() {
  // Pass an explicit default so Vue skips its own "injection not found"
  // warning -- an absent runtime is this composable's documented contract,
  // reported below with a clearer message.
  const runtime = inject(BabylonRuntimeServiceKey, undefined);

  if (!runtime) {
    throw new Error("Babylon runtime service was not provided.");
  }

  return runtime;
}
