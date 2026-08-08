import type { QVueGlobals } from "quasar";
import { describe, expect, it, vi } from "vitest";
import { openPreferencesDialog } from "./preference-dialogs.api";
import PreferencesDialog from "../components/PreferencesDialog.vue";

/** Chainable dialog handle stub. */
interface FakeDialogChain {
  onOk: () => FakeDialogChain;
  onCancel: () => FakeDialogChain;
  onDismiss: () => FakeDialogChain;
  hide: () => FakeDialogChain;
  update: () => FakeDialogChain;
}

/**
 * Build a fake `QVueGlobals` whose `dialog()` records the opened component
 * and returns a chainable stub.
 */
function makeFakeQuasar(): {
  quasar: QVueGlobals;
  openedComponents: unknown[];
  openedProps: Array<Record<string, unknown> | undefined>;
} {
  const openedComponents: unknown[] = [];
  const openedProps: Array<Record<string, unknown> | undefined> = [];

  const dialog = vi.fn(
    (options: {
      component: unknown;
      componentProps?: Record<string, unknown>;
    }) => {
      openedComponents.push(options.component);
      openedProps.push(options.componentProps);
      const chain: FakeDialogChain = {
        onOk: () => chain,
        onCancel: () => chain,
        onDismiss: () => chain,
        hide: () => chain,
        update: () => chain
      };
      return chain;
    }
  );

  return {
    quasar: { dialog } as unknown as QVueGlobals,
    openedComponents,
    openedProps
  };
}

describe("openPreferencesDialog", () => {
  it("opens PreferencesDialog", () => {
    const { quasar, openedComponents } = makeFakeQuasar();

    openPreferencesDialog(quasar);

    expect(openedComponents).toEqual([PreferencesDialog]);
  });

  it("opens PreferencesDialog on the general tab by default", () => {
    const { quasar, openedProps } = makeFakeQuasar();

    openPreferencesDialog(quasar);

    expect(openedProps[0]).toEqual({ tab: "general" });
  });

  it("opens PreferencesDialog on a requested tab", () => {
    const { quasar, openedProps } = makeFakeQuasar();

    openPreferencesDialog(quasar, "probe");

    expect(openedProps[0]).toEqual({ tab: "probe" });
  });
});
