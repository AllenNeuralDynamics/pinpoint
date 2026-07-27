import { type ComponentMountingOptions, mount } from "@vue/test-utils";
import type { Component } from "vue";
import { Notify, Quasar } from "quasar";
import { createI18n } from "vue-i18n";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import messages from "@/i18n";

/**
 * Minimal i18n instance backed by the app's real `en-US` messages, so
 * components using `$t(...)` render actual copy instead of raw keys.
 */
function createTestI18n() {
  return createI18n({
    locale: "en-US",
    legacy: false,
    messages
  });
}

/**
 * Mount a component wired up with the same global plugins the real app
 * installs (Quasar, vue-i18n, Pinia), so components using `$t`, Quasar
 * components/directives, or a store don't need bespoke per-test wiring.
 *
 * A fresh Pinia instance is created and activated for every mount unless one
 * is passed in via `options.pinia`, so store state never leaks between
 * tests.
 */
export function mountWithQuasar<T extends Component>(
  component: T,
  options: ComponentMountingOptions<T> & { pinia?: Pinia } = {}
) {
  const { pinia = createPinia(), ...mountOptions } = options;
  setActivePinia(pinia);

  return mount(component, {
    ...mountOptions,
    global: {
      ...mountOptions.global,
      // Matches the app's own `framework.plugins` (quasar.config.ts) so
      // components calling `useQuasar().notify(...)` don't blow up. Spread after `...mountOptions.global` so a caller's
      // own `global.plugins` is merged in rather than clobbering this array.
      plugins: [
        [Quasar, { plugins: { Notify } }],
        createTestI18n(),
        pinia,
        ...(mountOptions.global?.plugins ?? [])
      ]
    }
  });
}
