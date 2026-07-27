## Core rules

- Prefer clear, idiomatic implementations over clever or micro-optimized code.
- Keep changes focused. Do not refactor unrelated code unless tasked with exploratory work.
- Preserve existing public APIs unless changing them would provide an idiomatic implementation.
- Add or update tests when behavior changes, including meaningful untested branches.
- Do not export implementation details solely to make them testable; test through the module or feature’s public API.
- Put all user-visible strings in i18n resources.

## Tooling and validation

- Use `pnpm` and `pnpx`; never use `npm` or `npx`.
- After TypeScript or Vue changes, run `pnpm lint` and `pnpm typecheck`.
- After behavior changes, run `pnpm test`.
- Use `pnpm coverage` to identify meaningful test gaps; do not optimize for 100% coverage.
- For documentation-only changes, do not run unrelated checks unless requested.
- Fix all lint, type, and test failures introduced by the change.

## Import boundaries

- **Across feature boundaries:** import only from the target feature’s public barrel: `@/features/<feature>`.
- A feature barrel exports only symbols intended for use outside that feature.
- **Within a feature:** use direct relative imports, such as `./models/atlas.model` or `../api/source.api`.
- Never import a feature’s own barrel from within that feature; this avoids self-referential barrel dependency cycles.
- **Specs:** normally import the module under test with a relative path. Import from a public barrel only when testing the feature’s external contract.
- **Shared non-feature code:** use the appropriate absolute alias, normally `@/`, for app stores, services, composables, router, i18n, and test utilities.

## Vue `<script setup>` order

In every `<script setup lang="ts">`, order top-level declarations as follows:

1. Imports
2. Type declarations and module-level constants
3. Vue compiler macros: `defineOptions`, `defineProps`, `defineEmits`, `defineModel`, `defineSlots`
4. Dependency injection and composables
5. Reactive state: `ref`, `reactive`, `shallowRef`, and similar
6. Derived state: `computed`
7. Functions and event handlers
8. Reactive effects: `watch`, `watchEffect`
9. Lifecycle hooks: `onMounted`, `onUnmounted`, and similar
10. Public API: `defineExpose`

- Within each group, declare values before their consumers.
- If this order conflicts with valid JavaScript or TypeScript dependency order, preserve dependency correctness.
- Before completing an edited Vue SFC, verify this ordering and fix violations introduced in that file.

## TypeScript module order

Order module declarations as follows:

1. Imports: third-party first, then internal; keep `import type` separate
2. Exported types
3. Private types
4. Constants
5. Exported functions, ordered by public API usage
6. Private helpers

- Inline trivial single-use expressions.
- Use a module-private sibling helper for non-trivial or domain-named logic.
- Place a private helper immediately below its primary exported caller when practical; otherwise place shared helpers after exported functions.
- Nest a helper only when it meaningfully closes over operation-local state, not merely to make it private.
