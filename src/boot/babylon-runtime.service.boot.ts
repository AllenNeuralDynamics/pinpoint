import { defineBoot } from "#q-app";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import {
  BabylonRuntimeServiceKey,
  createBabylonRuntimeService
} from "@/services/babylon-runtime.service";

/**
 * Provide a Babylon runtime service instance to the app.
 */
export default defineBoot(({ app }) => {
  registerBuiltInLoaders();
  app.provide(BabylonRuntimeServiceKey, createBabylonRuntimeService());
});
