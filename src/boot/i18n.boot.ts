import { defineBoot } from "#q-app";
import { i18n } from "@/services/i18n.service";

/**
 * Install vue-i18n on the app, backed by the `en-US` message resources.
 */
export default defineBoot(({ app }) => {
  app.use(i18n);
});
