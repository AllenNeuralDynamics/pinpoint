import { afterEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import ProbeLibraryDialog from "./ProbeLibraryDialog.vue";
import {
  createWrapperRegistry,
  mountDialogWithQuasar
} from "@/test/mount-helper";
import InstallProbeDialog from "./InstallProbeDialog.vue";
import { getProbeInterfaceIdentifier } from "../api/probe.api";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { makeProbeInterfaceProbe } from "@/test/fixtures";

type DialogWrapper = VueWrapper<
  InstanceType<typeof ProbeLibraryDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

async function mountDialog(): Promise<DialogWrapper> {
  return wrappers.track(
    (await mountDialogWithQuasar(ProbeLibraryDialog)) as DialogWrapper
  );
}

function installProbeButton(wrapper: DialogWrapper) {
  return wrapper
    .findAllComponents({ name: "QBtn" })
    .find(btn => btn.text().includes("Install Probe"))!;
}

describe("ProbeLibraryDialog", () => {
  afterEach(() => {
    wrappers.unmountAll();
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
    it("renders the manufacturer display name with the raw model name when the model is unknown", async () => {
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
        expect.stringContaining("Cambridge NeuroTech ASSY-156")
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
      expect(item.text()).toContain("IMEC Neuropixels 2.0 multishank probe");
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

  describe("reorder", () => {
    async function addThreeProbes(wrapper: DialogWrapper) {
      const probeLibraryStore = useProbeLibraryStore();
      probeLibraryStore.add(
        makeProbeInterfaceProbe({
          annotations: { manufacturer: "imec", model_name: "np1" }
        })
      );
      probeLibraryStore.add(
        makeProbeInterfaceProbe({
          annotations: { manufacturer: "imec", model_name: "np2" }
        })
      );
      probeLibraryStore.add(
        makeProbeInterfaceProbe({
          annotations: { manufacturer: "imec", model_name: "np3" }
        })
      );
      await wrapper.vm.$nextTick();
    }

    it("moves the dragged row to the dropped-on row's index", async () => {
      const wrapper = await mountDialog();
      const probeLibraryStore = useProbeLibraryStore();
      await addThreeProbes(wrapper);

      let items = wrapper.findAllComponents({ name: "QItem" });
      await items[0]!.find(".probe-row__handle").trigger("dragstart");
      await items[2]!.trigger("dragover");
      await items[2]!.trigger("drop");

      expect(
        probeLibraryStore.library.map(getProbeInterfaceIdentifier)
      ).toEqual(["imec np2", "imec np3", "imec np1"]);
      items = wrapper.findAllComponents({ name: "QItem" });
      expect(items.map(item => item.text())).toEqual([
        expect.stringContaining("IMEC np2"),
        expect.stringContaining("IMEC np3"),
        expect.stringContaining("IMEC np1")
      ]);
    });

    it("is a no-op when a row is dropped on itself", async () => {
      const wrapper = await mountDialog();
      const probeLibraryStore = useProbeLibraryStore();
      await addThreeProbes(wrapper);
      const before = [...probeLibraryStore.library];

      const items = wrapper.findAllComponents({ name: "QItem" });
      await items[1]!.find(".probe-row__handle").trigger("dragstart");
      await items[1]!.trigger("dragover");
      await items[1]!.trigger("drop");

      expect(probeLibraryStore.library).toEqual(before);
    });

    it("is a no-op when a row is dropped without a preceding dragstart", async () => {
      const wrapper = await mountDialog();
      const probeLibraryStore = useProbeLibraryStore();
      await addThreeProbes(wrapper);
      const before = [...probeLibraryStore.library];

      const items = wrapper.findAllComponents({ name: "QItem" });
      await items[1]!.trigger("drop");

      expect(probeLibraryStore.library).toEqual(before);
    });
  });
});
