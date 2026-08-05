import { afterEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import type { DialogChainObject } from "quasar";
import SplashDialog from "./SplashDialog.vue";
import {
  createWrapperRegistry,
  mountDialogWithQuasar
} from "@/test/mount-helper";
import { NewExperimentDialog } from "@/features/experiment";

// SplashDialog's RecentExperimentsList creates the current-experiment store,
// and useExperimentFile also reads from this module -- both fetch on store
// creation via `computedAsync`, so mounting would trigger real network calls
// otherwise. Mock the leaf module, not the `@/features/atlas` barrel.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return { ...actual, getTerminologyRows: vi.fn() };
});

type DialogWrapper = VueWrapper<
  InstanceType<typeof SplashDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

async function mountDialog(): Promise<DialogWrapper> {
  return wrappers.track(
    (await mountDialogWithQuasar(SplashDialog)) as DialogWrapper
  );
}

describe("SplashDialog", () => {
  afterEach(() => {
    wrappers.unmountAll();
  });

  it("opens the new-experiment dialog when the new button is clicked", async () => {
    const wrapper = await mountDialog();
    // The `Dialog` Quasar plugin isn't registered by `mountWithQuasar`
    // (only `Notify` is), so `$q.dialog` doesn't exist to spy on yet;
    // stub it directly instead. `$q.dialog(...)` returns a chainable
    // object with `onOk`, which the splash uses to close itself when the
    // new-experiment dialog is confirmed.
    const onOk = vi.fn();
    const dialogSpy = vi.fn(() => ({ onOk }) as unknown as DialogChainObject);
    wrapper.vm.$q.dialog = dialogSpy;

    // The first q-btn is the "new" action.
    await wrapper.findComponent({ name: "QBtn" }).trigger("click");

    expect(dialogSpy).toHaveBeenCalledWith(
      expect.objectContaining({ component: NewExperimentDialog })
    );
    expect(onOk).toHaveBeenCalledWith(expect.any(Function));
  });

  it("closes itself when the new-experiment dialog it opened is confirmed", async () => {
    const wrapper = await mountDialog();
    const onOk = vi.fn();
    wrapper.vm.$q.dialog = vi.fn(
      () => ({ onOk }) as unknown as DialogChainObject
    );

    await wrapper.findComponent({ name: "QBtn" }).trigger("click");

    // Simulate the new-experiment dialog confirming, which should
    // propagate through to the splash's own `onDialogOK`.
    const onDialogOK = onOk.mock.calls[0]?.[0];
    expect(onDialogOK).toBeInstanceOf(Function);
    onDialogOK();

    expect(wrapper.emitted("ok")).toBeTruthy();
  });
});
