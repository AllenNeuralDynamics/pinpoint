import { afterEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import ProbeLibraryDialog from "./ProbeLibraryDialog.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import InstallProbeDialog from "./InstallProbeDialog.vue";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { makeProbeInterfaceProbe } from "@/test/fixtures";

type DialogWrapper = VueWrapper<
  InstanceType<typeof ProbeLibraryDialog> & { show(): void }
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
  const wrapper = mountWithQuasar(ProbeLibraryDialog, {
    attachTo: document.body
  }) as DialogWrapper;
  mountedWrappers.push(wrapper);
  wrapper.vm.show();
  await wrapper.vm.$nextTick();
  return wrapper;
}

function installProbeButton(wrapper: DialogWrapper) {
  return wrapper
    .findAllComponents({ name: "QBtn" })
    .find(btn => btn.text().includes("Install Probe"))!;
}

describe("ProbeLibraryDialog", () => {
  afterEach(() => {
    mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount());
  });

  describe("installProbe", () => {
    it("opens the install-probe dialog when the install button is clicked", async () => {
      const wrapper = await mountDialog();
      // The `Dialog` Quasar plugin isn't registered by `mountWithQuasar`
      // (only `Notify` is), so `$q.dialog` doesn't exist to spy on yet;
      // stub it directly instead.
      const dialogSpy = vi.fn().mockReturnValue({ onOk: vi.fn() });
      wrapper.vm.$q.dialog = dialogSpy;

      await installProbeButton(wrapper).trigger("click");

      expect(dialogSpy).toHaveBeenCalledWith(
        expect.objectContaining({ component: InstallProbeDialog })
      );
    });

    it("adds the resolved probe to the library", async () => {
      const wrapper = await mountDialog();
      const probeLibraryStore = useProbeLibraryStore();
      let onOkCallback: ((probe: unknown) => void) | undefined;
      wrapper.vm.$q.dialog = vi.fn().mockReturnValue({
        onOk: (callback: (probe: unknown) => void) => {
          onOkCallback = callback;
        }
      });

      await installProbeButton(wrapper).trigger("click");

      const probe = makeProbeInterfaceProbe();
      onOkCallback!(probe);

      expect(probeLibraryStore.library).toEqual([probe]);
    });
  });

  describe("library list", () => {
    it("renders each probe's manufacturer and model name when unknown", async () => {
      const wrapper = await mountDialog();
      const probeLibraryStore = useProbeLibraryStore();
      probeLibraryStore.add(
        makeProbeInterfaceProbe({
          annotations: { manufacturer: "IMEC", model_name: "Neuropixels 1.0" }
        })
      );
      probeLibraryStore.add(
        makeProbeInterfaceProbe({
          annotations: {
            manufacturer: "cambridgeneurotech",
            model_name: "ASSY-156"
          }
        })
      );
      await wrapper.vm.$nextTick();

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items.map(item => item.text())).toEqual([
        expect.stringContaining("IMEC Neuropixels 1.0"),
        expect.stringContaining("cambridgeneurotech ASSY-156")
      ]);
    });

    it("renders the known display name when the probe is in KNOWN_PROBES", async () => {
      const wrapper = await mountDialog();
      const probeLibraryStore = useProbeLibraryStore();
      probeLibraryStore.add(
        makeProbeInterfaceProbe({
          annotations: { manufacturer: "imec", model_name: "NP2013" }
        })
      );
      await wrapper.vm.$nextTick();

      const item = wrapper.findComponent({ name: "QItem" });
      expect(item.text()).toContain("Neuropixels 2.0 multishank probe");
    });
  });

  describe("remove", () => {
    it("removes the corresponding probe when its delete button is clicked", async () => {
      const wrapper = await mountDialog();
      const probeLibraryStore = useProbeLibraryStore();
      const probe = makeProbeInterfaceProbe();
      probeLibraryStore.add(probe);
      await wrapper.vm.$nextTick();

      const item = wrapper.findComponent({ name: "QItem" });
      await item.findComponent({ name: "QBtn" }).trigger("click");

      expect(probeLibraryStore.library).not.toContain(probe);
    });
  });
});
