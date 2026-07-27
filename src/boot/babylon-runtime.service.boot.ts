import { defineBoot } from "#q-app";
import {
  BabylonRuntimeServiceKey,
  createBabylonRuntimeService
} from "@/services/babylon-runtime.service";

export default defineBoot(({ app }) => {
  app.provide(BabylonRuntimeServiceKey, createBabylonRuntimeService());
});
