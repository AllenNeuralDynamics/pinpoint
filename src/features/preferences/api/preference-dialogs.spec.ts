import type { QVueGlobals } from "quasar";
import { describe, expect, it, vi } from "vitest";
import { openPreferencesDialog } from "./preference-dialogs.api";
import PreferencesDialog from "../components/PreferencesDialog.vue";
import WorldEditorDialog from "../components/WorldEditorDialog.vue";

/** Chainable dialog handle stub, recording the callback passed to `onOk`. */
interface FakeDialogChain {
  onOk: (callback: (result?: unknown) => void) => FakeDialogChain;
  onCancel: () => FakeDialogChain;
  onDismiss: () => FakeDialogChain;
  hide: () => FakeDialogChain;
  update: () => FakeDialogChain;
  recordedOnOk?: (result?: unknown) => void;
}

/**
 * Build a fake `QVueGlobals` whose `dialog()` records the opened component
 * and returns a chainable stub recording its `onOk` callback.
 */
function makeFakeQuasar(): {
  quasar: QVueGlobals;
  openedComponents: unknown[];
  openedProps: Array<Record<string, unknown> | undefined>;
  chains: FakeDialogChain[];
} {
  const openedComponents: unknown[] = [];
  const openedProps: Array<Record<string, unknown> | undefined> = [];
  const chains: FakeDialogChain[] = [];

  const dialog = vi.fn(
    (options: {
      component: unknown;
      componentProps?: Record<string, unknown>;
    }) => {
      openedComponents.push(options.component);
      openedProps.push(options.componentProps);
      const chain: FakeDialogChain = {
        onOk: callback => {
          chain.recordedOnOk = callback;
          return chain;
        },
        onCancel: () => chain,
        onDismiss: () => chain,
        hide: () => chain,
        update: () => chain
      };
      chains.push(chain);
      return chain;
    }
  );

  return {
    quasar: { dialog } as unknown as QVueGlobals,
    openedComponents,
    openedProps,
    chains
  };
}

describe("openPreferencesDialog", () => {
  it("opens PreferencesDialog", () => {
    const { quasar, openedComponents } = makeFakeQuasar();

    openPreferencesDialog(quasar);

    expect(openedComponents).toEqual([PreferencesDialog]);
  });

  it("opens WorldEditorDialog when the preferences dialog resolves with world-editor", () => {
    const { quasar, openedComponents, chains } = makeFakeQuasar();

    openPreferencesDialog(quasar);
    chains[0]!.recordedOnOk!("world-editor");

    expect(openedComponents).toEqual([PreferencesDialog, WorldEditorDialog]);
  });

  it("re-opens PreferencesDialog when the world editor resolves ok", () => {
    const { quasar, openedComponents, chains } = makeFakeQuasar();

    openPreferencesDialog(quasar);
    chains[0]!.recordedOnOk!("world-editor");
    chains[1]!.recordedOnOk!();

    expect(openedComponents).toEqual([
      PreferencesDialog,
      WorldEditorDialog,
      PreferencesDialog
    ]);
  });

  it("opens nothing further when preferences resolves without world-editor", () => {
    const { quasar, openedComponents, chains } = makeFakeQuasar();

    openPreferencesDialog(quasar);
    chains[0]!.recordedOnOk!(undefined);

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

  it("re-opens PreferencesDialog on the scene tab after the world editor", () => {
    const { quasar, openedProps, chains } = makeFakeQuasar();

    openPreferencesDialog(quasar);
    chains[0]!.recordedOnOk!("world-editor");
    chains[1]!.recordedOnOk!();

    expect(openedProps[2]).toEqual({ tab: "scene" });
  });
});
