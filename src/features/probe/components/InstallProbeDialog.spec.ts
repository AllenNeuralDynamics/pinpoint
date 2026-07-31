import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import InstallProbeDialog from "./InstallProbeDialog.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import {
  getManufacturers,
  getProbeInterfaceProbe,
  getProbeNames
} from "../api/install.api";

vi.mock("../api/install.api", async importOriginal => {
  const actual = await importOriginal<typeof import("../api/install.api")>();
  return {
    ...actual,
    getManufacturers: vi.fn(),
    getProbeNames: vi.fn(),
    getProbeInterfaceProbe: vi.fn()
  };
});

const mockedGetManufacturers = vi.mocked(getManufacturers);
const mockedGetProbeNames = vi.mocked(getProbeNames);
const mockedGetProbeInterfaceProbe = vi.mocked(getProbeInterfaceProbe);

type DialogWrapper = VueWrapper<
  InstanceType<typeof InstallProbeDialog> & { show(): void }
>;

async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

// Dialog content is teleported to `document.body` rather than into
// `wrapper.element`'s subtree, so each mounted dialog must be unmounted after
// its test or a later test's `document.body.querySelector` could pick up a
// leftover teleported node from a previous test.
const mountedWrappers: DialogWrapper[] = [];

// The dialog plugin only renders its content once `show()` (exposed by
// useDialogPluginComponent) is called, and needs to be attached to the DOM
// for its teleported content to be queryable.
async function mountDialog(): Promise<DialogWrapper> {
  const wrapper = mountWithQuasar(InstallProbeDialog, {
    attachTo: document.body
  }) as DialogWrapper;
  mountedWrappers.push(wrapper);
  wrapper.vm.show();
  await wrapper.vm.$nextTick();
  await flush();
  return wrapper;
}

async function selectManufacturer(
  wrapper: DialogWrapper,
  manufacturer: string
) {
  wrapper
    .findComponent({ name: "QSelect" })
    .vm.$emit("update:modelValue", manufacturer);
  await wrapper.vm.$nextTick();
  await flush();
  await wrapper.vm.$nextTick();
}

async function selectManufacturerAndProbe(
  wrapper: DialogWrapper,
  manufacturer: string,
  probeName: string
) {
  await selectManufacturer(wrapper, manufacturer);

  const item = wrapper
    .findAllComponents({ name: "QItem" })
    .find(i => i.text().includes(probeName))!;
  await item.trigger("click");
}

function installButton(wrapper: DialogWrapper) {
  return wrapper
    .findAllComponents({ name: "QBtn" })
    .find(btn => btn.text().includes("Install"))!;
}

function uploadButton(wrapper: DialogWrapper) {
  return wrapper
    .findAllComponents({ name: "QBtn" })
    .find(btn => btn.text().includes("Upload"))!;
}

// The file input is inside the dialog's teleported content, which lives
// outside `wrapper.element`'s DOM subtree, so it has to be queried from
// `document.body` directly rather than through the wrapper.
function fileInputElement(): HTMLInputElement {
  return document.body.querySelector('input[type="file"]')!;
}

async function uploadFile(wrapper: DialogWrapper, text: string) {
  const input = fileInputElement();
  const file = new File([text], "probe.json", {
    type: "application/json"
  });
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true
  });
  input.dispatchEvent(new Event("change"));
  await wrapper.vm.$nextTick();
  await flush();
}

describe("InstallProbeDialog", () => {
  beforeEach(() => {
    mockedGetManufacturers
      .mockReset()
      .mockResolvedValue(["neuropixels", "cambridge"]);
    mockedGetProbeNames
      .mockReset()
      .mockResolvedValue(["Neuropixels 1.0", "ASSY-156", "Cambridge H3"]);
    mockedGetProbeInterfaceProbe.mockReset();
  });

  afterEach(() => {
    mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount());
  });

  describe("probe search", () => {
    it("shows all probe names when the search query is empty", async () => {
      const wrapper = await mountDialog();
      await selectManufacturer(wrapper, "neuropixels");

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items.map(i => i.text())).toEqual([
        "Neuropixels 1.0",
        "ASSY-156",
        "Cambridge H3"
      ]);
    });

    it("narrows the list to fuzzy matches when searching", async () => {
      const wrapper = await mountDialog();
      await selectManufacturer(wrapper, "neuropixels");

      await wrapper.findComponent({ name: "QInput" }).setValue("Cambridge");
      await wrapper.vm.$nextTick();

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items.map(i => i.text())).toEqual(["Cambridge H3"]);
    });

    it("shows the known human-readable label for a recognized probe", async () => {
      mockedGetProbeNames.mockResolvedValue(["NP1000", "NP2013"]);

      const wrapper = await mountDialog();
      await selectManufacturer(wrapper, "imec");

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items.map(i => i.text())).toEqual([
        "Neuropixels 1.0 probe (NP1000)",
        "Neuropixels 2.0 multishank probe"
      ]);
    });

    it("falls back to the identifier for an unrecognized probe", async () => {
      mockedGetProbeNames.mockResolvedValue(["ASSY-1-E-1"]);

      const wrapper = await mountDialog();
      await selectManufacturer(wrapper, "cambridgeneurotech");

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items.map(i => i.text())).toEqual(["ASSY-1-E-1"]);
    });

    it("matches a search query against the human-readable label", async () => {
      mockedGetProbeNames.mockResolvedValue(["NP1000", "NP2013"]);

      const wrapper = await mountDialog();
      await selectManufacturer(wrapper, "imec");

      await wrapper.findComponent({ name: "QInput" }).setValue("multishank");
      await wrapper.vm.$nextTick();

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items.map(i => i.text())).toEqual([
        "Neuropixels 2.0 multishank probe"
      ]);
    });
  });

  describe("install button state", () => {
    it("is disabled until a probe is selected", async () => {
      const wrapper = await mountDialog();
      expect(installButton(wrapper).props("disable")).toBe(true);

      await selectManufacturerAndProbe(
        wrapper,
        "neuropixels",
        "Neuropixels 1.0"
      );

      expect(installButton(wrapper).props("disable")).toBe(false);
    });

    it("clears the selected probe when the manufacturer changes", async () => {
      const wrapper = await mountDialog();
      await selectManufacturerAndProbe(
        wrapper,
        "neuropixels",
        "Neuropixels 1.0"
      );
      expect(installButton(wrapper).props("disable")).toBe(false);

      await selectManufacturer(wrapper, "cambridge");

      expect(installButton(wrapper).props("disable")).toBe(true);
    });
  });

  describe("install", () => {
    it("fetches the selected probe and resolves the dialog with it", async () => {
      const probe = {
        ndim: 2,
        si_units: "um",
        contact_positions: [[0, 0]]
      };
      mockedGetProbeInterfaceProbe.mockResolvedValue(probe);

      const wrapper = await mountDialog();
      await selectManufacturerAndProbe(
        wrapper,
        "neuropixels",
        "Neuropixels 1.0"
      );

      await installButton(wrapper).trigger("click");
      await flush();

      expect(mockedGetProbeInterfaceProbe).toHaveBeenCalledWith(
        "neuropixels",
        "Neuropixels 1.0"
      );
      expect(wrapper.emitted("ok")).toEqual([[probe]]);
    });

    it("uses the probe identifier, not its label, to fetch and install", async () => {
      mockedGetProbeNames.mockResolvedValue(["NP2013"]);
      const probe = {
        ndim: 2,
        si_units: "um",
        contact_positions: [[0, 0]]
      };
      mockedGetProbeInterfaceProbe.mockResolvedValue(probe);

      const wrapper = await mountDialog();
      await selectManufacturerAndProbe(
        wrapper,
        "imec",
        "Neuropixels 2.0 multishank probe"
      );

      await installButton(wrapper).trigger("click");
      await flush();

      expect(mockedGetProbeInterfaceProbe).toHaveBeenCalledWith(
        "imec",
        "NP2013"
      );
      expect(wrapper.emitted("ok")).toEqual([[probe]]);
    });

    it("notifies an error and doesn't resolve when the probe can't be found", async () => {
      mockedGetProbeInterfaceProbe.mockResolvedValue(null);

      const wrapper = await mountDialog();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await selectManufacturerAndProbe(
        wrapper,
        "neuropixels",
        "Neuropixels 1.0"
      );

      await installButton(wrapper).trigger("click");
      await flush();

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ color: "negative" })
      );
      expect(wrapper.emitted("ok")).toBeUndefined();
    });
  });

  describe("upload custom probe", () => {
    it("resolves the dialog with the first probe from a valid file", async () => {
      const wrapper = await mountDialog();
      const probe = {
        ndim: 2,
        si_units: "um",
        contact_positions: [[0, 0]],
        annotations: { model_name: "1.0", manufacturer: "IMEC" }
      };

      await uploadFile(
        wrapper,
        JSON.stringify({
          specification: "probeinterface",
          version: "0.2.24",
          probes: [probe]
        })
      );

      expect(wrapper.emitted("ok")).toEqual([[probe]]);
    });

    it("notifies an error and doesn't resolve for an invalid file", async () => {
      const wrapper = await mountDialog();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await uploadFile(wrapper, "not json");

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ color: "negative" })
      );
      expect(wrapper.emitted("ok")).toBeUndefined();
    });

    it("clicking the upload button opens the file picker", async () => {
      const wrapper = await mountDialog();
      const clickSpy = vi.spyOn(fileInputElement(), "click");

      await uploadButton(wrapper).trigger("click");

      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
