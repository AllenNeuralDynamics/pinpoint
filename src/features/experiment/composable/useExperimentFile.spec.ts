import parse from "semver/functions/parse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { VueWrapper } from "@vue/test-utils";
import { strToU8, zipSync } from "fflate";
import { useExperimentFile } from "./useExperimentFile";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  createWrapperRegistry,
  flushMicrotasks,
  mountWithQuasar
} from "@/test/mount-helper";
import { makeAtlas, makeSceneObject } from "@/test/fixtures";
import { zipExperiment } from "../api/experiment-file.api";
import { buildExperiment } from "../api/experiment.api";
import type { Experiment } from "../models/experiment.model";
import { getSceneObjectModel } from "@/features/scene";
import enUS from "@/i18n/en-US";

// Mock the leaf module (not the `@/features/atlas` barrel), matching the
// pattern in `current-experiment.store.spec.ts`.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

// `getSceneObjectModel`/`putSceneObjectModel` go through `idb-keyval`, which
// needs a real IndexedDB the test environment doesn't provide. Replace it
// with an in-memory map, matching `scene-object-model.spec.ts`.
const sceneObjectModelMemoryStore = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  createStore: () => "fake-store",
  get: async (key: string) => sceneObjectModelMemoryStore.get(key),
  set: async (key: string, value: unknown) => {
    sceneObjectModelMemoryStore.set(key, value);
  }
}));

// `useFileDialog`'s input is never attached to the DOM, so it can't be
// driven through a queryable `<input type="file">` the way
// `InstallProbeDialog.spec.ts` drives its hidden input. Replace it with a
// fake that records the registered `onChange` callback and an `open` spy.
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

/**
 * Build a zip file for an experiment, matching what a real experiment
 * download would produce.
 * @param experiment Experiment to zip.
 * @param fileName Name for the built `File`.
 */
function makeExperimentZipFile(
  experiment: Experiment,
  fileName = "e.zip"
): File {
  return new File([zipExperiment(experiment, new Map()).slice()], fileName, {
    type: "application/zip"
  });
}

const Harness = defineComponent({
  setup() {
    return useExperimentFile();
  },
  template: "<div></div>"
});

type HarnessWrapper = VueWrapper<InstanceType<typeof Harness>>;

const wrappers = createWrapperRegistry<HarnessWrapper>();

function mountHarness(): HarnessWrapper {
  return wrappers.track(mountWithQuasar(Harness) as HarnessWrapper);
}

/**
 * Build a version string a major version below the running app version, so
 * version-skew tests stay meaningful across a version bump.
 */
function buildOlderMajorVersion(): string {
  const appVersion = parse(import.meta.env.APP_VERSION)!;
  return `${appVersion.major - 1}.0.0`;
}

/**
 * Build a version string a minor version above the running app version.
 */
function buildNewerMinorVersion(): string {
  const appVersion = parse(import.meta.env.APP_VERSION)!;
  return `${appVersion.major}.${appVersion.minor + 1}.0`;
}

describe("useExperimentFile", () => {
  beforeEach(() => {
    openFileDialogSpy.mockReset();
    capturedOnChange = null;
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  describe("openExperiment", () => {
    it("opens the file dialog", () => {
      const wrapper = mountHarness();

      wrapper.vm.openExperiment();

      expect(openFileDialogSpy).toHaveBeenCalled();
    });
  });

  describe("loading a picked file", () => {
    it("loads a valid experiment file into the store", async () => {
      const wrapper = mountHarness();
      const store = useCurrentExperimentStore();
      const experiment = buildExperiment(
        "Loaded Experiment",
        makeAtlas(),
        [0, 0, 0]
      );
      const file = makeExperimentZipFile(experiment);
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      expect(store.name).toBe("Loaded Experiment");
      expect(notifySpy).not.toHaveBeenCalled();
    });

    it("fires onOpened after a successful load", async () => {
      const wrapper = mountHarness();
      const onOpenedSpy = vi.fn();
      wrapper.vm.onOpened(onOpenedSpy);
      const experiment = buildExperiment("Loaded", makeAtlas(), [0, 0, 0]);
      const file = makeExperimentZipFile(experiment);

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      expect(onOpenedSpy).toHaveBeenCalled();
    });

    it("notifies an error and leaves the store untouched for non-zip bytes", async () => {
      const wrapper = mountHarness();
      const store = useCurrentExperimentStore();
      const originalName = store.name;
      const file = new File(["not a zip"], "e.zip", {
        type: "application/zip"
      });
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ color: "negative" })
      );
      expect(store.name).toBe(originalName);
    });

    it("notifies an error for a zip whose experiment.json isn't an experiment", async () => {
      const wrapper = mountHarness();
      const zipBytes = zipSync({ "experiment.json": strToU8("{}") });
      const file = new File([zipBytes], "e.zip", { type: "application/zip" });
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ color: "negative" })
      );
    });

    it("does nothing when the file list is null, as reset: true fires on open", async () => {
      const wrapper = mountHarness();
      const store = useCurrentExperimentStore();
      const originalName = store.name;
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await capturedOnChange!(null);
      await flushMicrotasks();

      expect(notifySpy).not.toHaveBeenCalled();
      expect(store.name).toBe(originalName);
    });

    it("notifies an error when the file can't be read", async () => {
      const wrapper = mountHarness();
      const file = new File(["irrelevant"], "e.zip", {
        type: "application/zip"
      });
      vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("read failed"));
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ color: "negative" })
      );
    });

    it("notifies an error and still loads a file that's a major version behind", async () => {
      const wrapper = mountHarness();
      const store = useCurrentExperimentStore();
      const experiment = {
        ...buildExperiment("Loaded", makeAtlas(), [0, 0, 0]),
        version: buildOlderMajorVersion()
      };
      const file = makeExperimentZipFile(experiment);
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      expect(store.name).toBe("Loaded");
      expect(store.experiment.version).toBe(experiment.version);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: enUS.experimentFile.versionMajorBehind,
          color: "negative"
        })
      );
    });

    it("notifies a warning and still loads a file that's a minor version ahead", async () => {
      const wrapper = mountHarness();
      const store = useCurrentExperimentStore();
      const experiment = {
        ...buildExperiment("Loaded", makeAtlas(), [0, 0, 0]),
        version: buildNewerMinorVersion()
      };
      const file = makeExperimentZipFile(experiment);
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      expect(store.name).toBe("Loaded");
      expect(store.experiment.version).toBe(experiment.version);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: enUS.experimentFile.versionMinorAhead,
          color: "warning"
        })
      );
    });

    it("notifies a warning and still loads a file with an unparsable version", async () => {
      const wrapper = mountHarness();
      const store = useCurrentExperimentStore();
      const experiment = {
        ...buildExperiment("Loaded", makeAtlas(), [0, 0, 0]),
        version: "5.0"
      };
      const file = makeExperimentZipFile(experiment);
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      expect(store.name).toBe("Loaded");
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: enUS.experimentFile.versionUnknown,
          color: "warning"
        })
      );
    });

    it("writes a scene object's model file before loading the experiment", async () => {
      const experiment = buildExperiment("Loaded", makeAtlas(), [0, 0, 0]);
      const sceneObject = makeSceneObject();
      experiment.sceneObjects = [sceneObject];
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const file = new File(
        [
          zipExperiment(
            experiment,
            new Map([[sceneObject.id, { fileName: "model.obj", bytes }]])
          ).slice()
        ],
        "e.zip",
        { type: "application/zip" }
      );
      mountHarness();

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      const stored = await getSceneObjectModel(sceneObject.id);
      expect(stored?.name).toBe("model.obj");
      expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(bytes);
    });
  });

  describe("downloadExperiment", () => {
    it("triggers a download named after the current experiment", async () => {
      const wrapper = mountHarness();
      const store = useCurrentExperimentStore();
      store.experiment.name = "My Experiment";
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      await wrapper.vm.downloadExperiment();
      await flushMicrotasks();

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });
  });
});
