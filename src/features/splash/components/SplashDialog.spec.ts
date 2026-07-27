import { describe, expect, it, vi, afterEach } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import type { DialogChainObject } from "quasar";
import SplashDialog from "./SplashDialog.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { NewExperimentDialog } from "@/features/experiment";

type DialogWrapper = VueWrapper<
  InstanceType<typeof SplashDialog> & { show(): void }
>;

// Dialog content is teleported to `document.body` rather than into
// `wrapper.element`'s subtree, so each mounted dialog must be unmounted after
// its test or a later test's `document.body.querySelector` could pick up a
// leftover teleported node from a previous test.
const mountedWrappers: DialogWrapper[] = [];

// The dialog plugin only renders its content once `show()` (exposed by
// useDialogPluginComponent) is called, and needs to be attached to the DOM
// for its teleported content to be queryable.
async function mountDialog(): Promise<DialogWrapper> {
  const wrapper = mountWithQuasar(SplashDialog, {
    attachTo: document.body
  }) as DialogWrapper;
  mountedWrappers.push(wrapper);
  wrapper.vm.show();
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe("SplashDialog", () => {
  afterEach(() => {
    mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount());
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

  it("renders 20 recent experiment placeholder items", async () => {
    const wrapper = await mountDialog();

    const items = wrapper.findAllComponents({ name: "QItem" });

    expect(items).toHaveLength(20);
  });
});
