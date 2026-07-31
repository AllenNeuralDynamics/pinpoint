import { defineBoot } from "#q-app";
import {
  BabylonRuntimeServiceKey,
  createBabylonRuntimeService
} from "@/services/babylon-runtime.service";

/**
 * Provide a Babylon runtime service instance to the app.
 */
export default defineBoot(({ app }) => {
  app.provide(BabylonRuntimeServiceKey, createBabylonRuntimeService());
});
