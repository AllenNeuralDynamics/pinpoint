## Skills

Before starting any task, load all skills relevant to the work:

- **Vue SFCs / components** → `vue`, `vue-best-practices`
- **Pinia stores** → `pinia`
- **Routing** → `vue-router-best-practices`
- **Composables / utilities** → `vueuse-functions`
- **Tests** → `vitest`, `vue-testing-best-practices`
- **Package management / scripts** → `pnpm`
- **UI / layout / styling** → `web-design-guidelines`

Load multiple skills when a task spans domains (e.g. a new feature touches a store, a component, and tests).

## Core rules

- Prefer clear, idiomatic implementations over clever or micro-optimized code.
- Keep changes focused; do not refactor unrelated code unless explicitly tasked.
- Preserve existing public APIs unless an idiomatic change requires updating them.
- Design APIs to be as functional and pure as possible: prefer functions that take explicit inputs and return values over functions that read or mutate shared state. Pure APIs are inherently easier to test in isolation.
- Pure functions that mutate or use some object should have the object be the first argument.
- When dealing with Pinia stores, prefer mutating state in place directly, even in otherwise-pure functions — Pinia's reactivity and persistence track mutations, not replaced references.
- Never engineer for backwards compatibility with old data or file formats — this applies everywhere, not just stores. Concretely, this means: no `afterHydrate`/`beforeHydrate` migration logic in Pinia persist config, no functions that backfill, default, or "normalize" missing/legacy fields on loaded data, and no version-based branching that patches old data into the current shape. Type guards (`isX`) and parsers (`parseX`) must reject data that doesn't match the current shape outright rather than tolerate it — treat mismatched old data as invalid input to reject, not something to repair.
- Add or update tests when behavior changes, including meaningful untested branches.
- Do not export implementation details solely to enable testing; test through public APIs.
- Put all user-visible strings in i18n resources.
- Add TSDoc to every function. Keep it to 1-2 concise lines describing the function and its inputs/outputs. Avoid implementation details, extended rationale, performance explanations, and narrative comments. Use brief block comments only for non-obvious code. Surface notable tradeoffs, concerns, or implementation context in your response to the user, not in code comments.
- Keep `@param` tags even when they restate the parameter name; omit `@returns` (the summary line already describes the output).

## Tooling

- Use `pnpm` / `pnpx`; never `npm` / `npx`.
- After TypeScript or Vue changes: `pnpm lint && pnpm typecheck`.
- After behavior changes: `pnpm test`.
- Use `pnpm coverage` to find meaningful gaps; do not optimize for 100% coverage.
- Prefer a lightweight real instance over a mock when a dependency ships a test-grade one (vue-i18n with the real `en-US` messages, a fresh Pinia instance per mount, BabylonJS's `NullEngine`) — this exercises real integration points without the cost of the real backing service. Mock only what is slow, non-deterministic, or external I/O (network/axios, Draco workers, the filesystem). Isolate the unit under test completely — a functional API design makes this natural since dependencies are passed as arguments rather than imported implicitly.
- Skip unrelated checks for documentation-only changes.
- Fix all lint, type, and test failures introduced by the change.

## Import boundaries

- **Across features:** import only from the feature's public barrel — `@/features/<feature>`.
- **Within a feature:** use direct relative imports (`./models/atlas.model`).
- **Never** import a feature's own barrel from within that feature.
- **Specs:** use relative imports for the unit under test; use the barrel only when testing the external contract.
- **Shared code** (stores, composables, router, i18n, test utilities): use the `@/` alias.

## Vue `<script setup>` order

In every `<script setup lang="ts">`, declare in this order:

1. Imports
2. Type declarations and module-level constants
3. Compiler macros: `defineOptions`, `defineProps`, `defineEmits`, `defineModel`, `defineSlots`
4. Dependency injection and composables
5. Reactive state: `ref`, `reactive`, `shallowRef`
6. Derived state: `computed`
7. Functions and event handlers
8. Reactive effects: `watch`, `watchEffect`
9. Lifecycle hooks: `onMounted`, `onUnmounted`, etc.
10. `defineExpose`

Declare values before their consumers within each group. Verify and fix this ordering before completing any edited SFC.

Exception: a composable whose arguments are derived state (e.g. `useFuse(searchQuery, items, ...)` taking `computed` refs) may be declared alongside those inputs instead of strictly in group 4, since "declare values before their consumers" otherwise conflicts with the group ordering.

## TypeScript module order

1. Imports (third-party first, then internal; `import type` separate)
2. Exported types
3. Private types
4. Constants
5. Exported functions (ordered by public API usage)
6. Private helpers (immediately below primary caller when practical)

Inline trivial single-use expressions. Nest helpers only when they close over operation-local state.

## Pinia store order

1. Dependencies / composables
2. State (`ref` / `reactive`)
3. Derived state (`computed`)
4. Actions
5. Explicit grouped return: `{ ...state, ...getters, ...actions }`

Use `shallowRef` for BabylonJS instances.
