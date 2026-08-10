import parse from "semver/functions/parse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import ExportPreferences from "./ExportPreferences.vue";
import { usePreferencesStore } from "@/stores/preferences.store";
import {
  createWrapperRegistry,
  flushMicrotasks,
  mountWithQuasar
} from "@/test/mount-helper";
import enUS from "@/i18n/en-US";

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

/**
 * Build a full preferences file body, defaulting to the store's own
 * defaults so tests only need to override the fields they care about.
 * @param overrides Fields to override on the default preferences.
 */
function buildUploadedPreferences(overrides: Record<string, unknown> = {}) {
  return {
    version: import.meta.env.APP_VERSION,
    appearance: "auto",
    isSplashScreenSkipped: false,
    cameraProjection: "perspective",
    cameraInertia: 0.9,
    worldBackgroundColorLightMode: "#33334d",
    worldBackgroundColorDarkMode: "#33334d",
    worldLightIntensity: 1,
    materialSpecularIntensity: 1,
    materialSpecularPower: 64,
    isSsaoEnabled: true,
    ssaoRatio: 0.5,
    areStructureInteriorsHidden: true,
    positionUnit: "millimeter",
    rotationUnit: "degree",
    decimalPrecision: 3,
    probeShankThicknessMillimeters: 0.05,
    probeHeadStageLengthMillimeters: 20,
    probeHeadStageCutDepthMillimeters: 17.5,
    probeRodDiameterMillimeters: 8,
    probeRodLengthMillimeters: 200,
    ...overrides
  };
}

async function uploadFile(text: string) {
  const file = new File([text], "p.json", { type: "application/json" });
  await capturedOnChange!(makeFileList(file));
  await flushMicrotasks();
}

type ExportWrapper = VueWrapper<InstanceType<typeof ExportPreferences>>;

const wrappers = createWrapperRegistry<ExportWrapper>();

function mountExport(): ExportWrapper {
  return wrappers.track(mountWithQuasar(ExportPreferences));
}

describe("ExportPreferences", () => {
  beforeEach(() => {
    openFileDialogSpy.mockReset();
    capturedOnChange = null;
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  describe("downloadPreferences", () => {
    it("triggers a download named pinpoint-preferences.json", async () => {
      const wrapper = mountExport();
      let downloadName: string | undefined;
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function (this: HTMLAnchorElement) {
          downloadName = this.download;
        });

      await wrapper
        .findAllComponents({ name: "QBtn" })
        .find(button =>
          button.text().includes(enUS.preferences.downloadPreferences)
        )!
        .trigger("click");
      await flushMicrotasks();

      expect(clickSpy).toHaveBeenCalled();
      expect(downloadName).toBe("pinpoint-preferences.json");
      clickSpy.mockRestore();
    });
  });

  describe("uploadPreferences", () => {
    it("clicking Upload opens the file dialog", async () => {
      const wrapper = mountExport();

      await wrapper
        .findAllComponents({ name: "QBtn" })
        .find(button =>
          button.text().includes(enUS.preferences.uploadPreferences)
        )!
        .trigger("click");

      expect(openFileDialogSpy).toHaveBeenCalled();
    });
  });

  describe("uploading a picked file", () => {
    it("replaces every non-version preference and notifies success on a matching version", async () => {
      const wrapper = mountExport();
      const store = usePreferencesStore();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      const uploaded = buildUploadedPreferences({
        cameraProjection: "orthographic",
        cameraInertia: 0.1,
        worldBackgroundColorLightMode: "#ff0000",
        worldBackgroundColorDarkMode: "#00ff00",
        worldLightIntensity: 1.5,
        materialSpecularIntensity: 0.5,
        materialSpecularPower: 32,
        areStructureInteriorsHidden: false,
        isSsaoEnabled: false,
        ssaoRatio: 0.25,
        positionUnit: "centimeter",
        rotationUnit: "radian",
        decimalPrecision: 1,
        probeShankThicknessMillimeters: 1,
        probeHeadStageLengthMillimeters: 30,
        probeHeadStageCutDepthMillimeters: 10,
        probeRodDiameterMillimeters: 5,
        probeRodLengthMillimeters: 150,
        appearance: "dark",
        isSplashScreenSkipped: true
      });

      await uploadFile(JSON.stringify(uploaded));

      expect(store.cameraProjection).toBe(uploaded.cameraProjection);
      expect(store.cameraInertia).toBe(uploaded.cameraInertia);
      expect(store.worldBackgroundColorLightMode).toBe(
        uploaded.worldBackgroundColorLightMode
      );
      expect(store.worldBackgroundColorDarkMode).toBe(
        uploaded.worldBackgroundColorDarkMode
      );
      expect(store.worldLightIntensity).toBe(uploaded.worldLightIntensity);
      expect(store.materialSpecularIntensity).toBe(
        uploaded.materialSpecularIntensity
      );
      expect(store.materialSpecularPower).toBe(uploaded.materialSpecularPower);
      expect(store.areStructureInteriorsHidden).toBe(
        uploaded.areStructureInteriorsHidden
      );
      expect(store.isSsaoEnabled).toBe(uploaded.isSsaoEnabled);
      expect(store.ssaoRatio).toBe(uploaded.ssaoRatio);
      expect(store.positionUnit).toBe(uploaded.positionUnit);
      expect(store.rotationUnit).toBe(uploaded.rotationUnit);
      expect(store.decimalPrecision).toBe(uploaded.decimalPrecision);
      expect(store.probeShankThicknessMillimeters).toBe(
        uploaded.probeShankThicknessMillimeters
      );
      expect(store.probeHeadStageLengthMillimeters).toBe(
        uploaded.probeHeadStageLengthMillimeters
      );
      expect(store.probeHeadStageCutDepthMillimeters).toBe(
        uploaded.probeHeadStageCutDepthMillimeters
      );
      expect(store.probeRodDiameterMillimeters).toBe(
        uploaded.probeRodDiameterMillimeters
      );
      expect(store.probeRodLengthMillimeters).toBe(
        uploaded.probeRodLengthMillimeters
      );
      expect(store.appearance).toBe(uploaded.appearance);
      expect(store.isSplashScreenSkipped).toBe(uploaded.isSplashScreenSkipped);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: enUS.preferences.preferencesImported,
          color: "positive"
        })
      );
    });

    it("stamps the running version, notifying an error for a major-behind file", async () => {
      const wrapper = mountExport();
      const store = usePreferencesStore();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      const uploaded = buildUploadedPreferences({
        version: buildOlderMajorVersion(),
        probeRodLengthMillimeters: 300
      });

      await uploadFile(JSON.stringify(uploaded));

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: enUS.preferences.versionMajorBehind,
          color: "negative"
        })
      );
      expect(store.probeRodLengthMillimeters).toBe(300);
      expect(store.version).toBe(import.meta.env.APP_VERSION);
    });

    it("notifies a warning and still applies a minor-ahead file", async () => {
      const wrapper = mountExport();
      const store = usePreferencesStore();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      const uploaded = buildUploadedPreferences({
        version: buildNewerMinorVersion(),
        probeRodLengthMillimeters: 175
      });

      await uploadFile(JSON.stringify(uploaded));

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: enUS.preferences.versionMinorAhead,
          color: "warning"
        })
      );
      expect(store.probeRodLengthMillimeters).toBe(175);
      expect(store.version).toBe(import.meta.env.APP_VERSION);
    });

    it("notifies a warning and still applies a file with an unparsable version", async () => {
      const wrapper = mountExport();
      const store = usePreferencesStore();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      const uploaded = buildUploadedPreferences({
        version: "5.0",
        probeRodLengthMillimeters: 175
      });

      await uploadFile(JSON.stringify(uploaded));

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: enUS.preferences.versionUnknown,
          color: "warning"
        })
      );
      expect(store.probeRodLengthMillimeters).toBe(175);
      expect(store.version).toBe(import.meta.env.APP_VERSION);
    });

    it("leaves every preference at its default and notifies an error for an invalid file", async () => {
      const wrapper = mountExport();
      const store = usePreferencesStore();
      const defaults = { ...store };
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await uploadFile("{}");

      expect(store).toEqual(defaults);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: enUS.preferences.invalidPreferencesFile,
          color: "negative"
        })
      );
    });

    it("does nothing when the file list is null, as reset: true fires on open", async () => {
      const wrapper = mountExport();
      const store = usePreferencesStore();
      const defaults = { ...store };
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await capturedOnChange!(null);
      await flushMicrotasks();

      expect(notifySpy).not.toHaveBeenCalled();
      expect(store).toEqual(defaults);
    });

    it("notifies the invalid-file error and leaves the store untouched when the file can't be read", async () => {
      const wrapper = mountExport();
      const store = usePreferencesStore();
      const defaults = { ...store };
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      const file = new File(["irrelevant"], "p.json", {
        type: "application/json"
      });
      vi.spyOn(file, "text").mockRejectedValue(new Error("read failed"));

      await capturedOnChange!(makeFileList(file));
      await flushMicrotasks();

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: enUS.preferences.invalidPreferencesFile,
          color: "negative"
        })
      );
      expect(store).toEqual(defaults);
    });
  });
});
