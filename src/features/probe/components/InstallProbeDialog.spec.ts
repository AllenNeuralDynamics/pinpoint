import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import InstallProbeDialog from "./InstallProbeDialog.vue";
import {
  createWrapperRegistry,
  flushMicrotasks,
  mountDialogWithQuasar
} from "@/test/mount-helper";
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

// `useFileDialog`'s input is never attached to the DOM, so it can't be
// driven through a queryable `<input type="file">`. Replace it with a fake
// that records the registered `onChange` callback and an `open` spy,
// matching the pattern in `useExperimentFile.spec.ts`.
const openFileDialogSpy = vi.fn();
let capturedOnChange:
  | ((files: FileList | null) => void | Promise<void>)
  | null = null;

vi.mock("@vueuse/core", async importOriginal => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...actual,
    useFileDialog: () => ({
      files: { value: null },
      open: openFileDialogSpy,
      reset: vi.fn(),
      onChange: (
        callback: (files: FileList | null) => void | Promise<void>
      ) => {
        capturedOnChange = callback;
      },
      onCancel: vi.fn()
    })
  };
});

/**
 * Build a fake `FileList` containing a single file, matching what a real
 * file input's `change` event would provide.
 */
function makeFileList(file: File): FileList {
  return { 0: file, length: 1, item: () => file } as unknown as FileList;
}

type DialogWrapper = VueWrapper<
  InstanceType<typeof InstallProbeDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

async function mountDialog(): Promise<DialogWrapper> {
  const wrapper = wrappers.track(
    (await mountDialogWithQuasar(InstallProbeDialog)) as DialogWrapper
  );
  await flushMicrotasks();
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
  await flushMicrotasks();
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

async function uploadFile(text: string) {
  const file = new File([text], "probe.json", { type: "application/json" });
  await capturedOnChange!(makeFileList(file));
  await flushMicrotasks();
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
    openFileDialogSpy.mockReset();
    capturedOnChange = null;
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  describe("manufacturer select", () => {
    it("shows the known display name for a recognized manufacturer", async () => {
      mockedGetManufacturers.mockResolvedValue(["cambridgeneurotech", "imec"]);

      const wrapper = await mountDialog();
      await selectManufacturer(wrapper, "cambridgeneurotech");

      expect(wrapper.findComponent({ name: "QSelect" }).text()).toContain(
        "Cambridge NeuroTech"
      );
    });

    it("falls back to the raw folder name for an unrecognized manufacturer", async () => {
      mockedGetManufacturers.mockResolvedValue(["acme"]);

      const wrapper = await mountDialog();
      await selectManufacturer(wrapper, "acme");

      expect(wrapper.findComponent({ name: "QSelect" }).text()).toContain(
        "acme"
      );
    });

    it("uses the raw folder name, not its display label, to fetch probe names", async () => {
      mockedGetManufacturers.mockResolvedValue(["cambridgeneurotech"]);

      const wrapper = await mountDialog();
      await selectManufacturer(wrapper, "cambridgeneurotech");

      expect(mockedGetProbeNames).toHaveBeenCalledWith("cambridgeneurotech");
    });
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
      await flushMicrotasks();

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
      await flushMicrotasks();

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
      await flushMicrotasks();

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "negative" })
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

      await uploadFile("not json");

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "negative" })
      );
      expect(wrapper.emitted("ok")).toBeUndefined();
    });

    it("clicking the upload button opens the file picker", async () => {
      const wrapper = await mountDialog();

      await uploadButton(wrapper).trigger("click");

      expect(openFileDialogSpy).toHaveBeenCalled();
    });
  });
});
