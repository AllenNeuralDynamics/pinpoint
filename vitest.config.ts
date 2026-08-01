import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { quasar } from "@quasar/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// Standalone Vitest config.
//
// Quasar's CLI (`quasar dev`/`quasar build`) reads `quasar.config.ts`, but the
// `vitest` CLI does not go through Quasar's build pipeline, so it never sees
// that file's `extendViteConf`/`vitePlugins`. This config mirrors what's
// needed to run unit tests: the Vue SFC + Quasar plugins (so `.vue` files and
// auto-imported Quasar components compile) and the `@` -> `src` alias used
// throughout the app.
export default defineConfig({
  plugins: [vue(), quasar()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  define: {
    // Mirrors quasar.config.ts's build.defineEnv, which the vitest CLI never
    // sees.
    "import.meta.env.APP_VERSION": JSON.stringify(pkg.version)
  },
  test: {
    globals: true,
    environment: "happy-dom",
    exclude: [...configDefaults.exclude, ".direnv", ".claude"],
    setupFiles: ["./src/test/setup.ts"]
  }
});
