import { defineConfig } from "oxlint";

export default defineConfig({
  $schema: "./node_modules/oxlint/configuration_schema.json",

  ignorePatterns: [
    ".agents/",
    "**/node_modules/",
    "dist/",
    "quasar.config.*.temporary.compiled*",
    ".quasar/",
    "src-cordova/",
    "src-capacitor/",
    "src/router/typed-router.d.ts"
  ],

  options: {
    typeAware: true,
    typeCheck: true,
    maxWarnings: 10
  },

  plugins: ["typescript", "vue", "import", "eslint", "promise", "unicorn"],

  categories: {
    correctness: "error"
    // style: 'error',
    // pedantic: 'warn',
    // suspicious: 'error',
    // perf: 'error',
    // restriction: 'error'
  },

  rules: {
    // Note: this only inspects `import` statements, not string arguments to
    // `vi.mock()`. A spec that mocks a feature's internals must still follow
    // AGENTS.md's import boundaries by hand.
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            regex: "^@/features/[^/]+/.+",
            message:
              "Import from the feature index instead: @/features/feature-name"
          }
        ]
      }
    ]
  },

  env: {
    builtin: true
  }
});
