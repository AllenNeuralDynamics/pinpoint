import { createEventHook, useFileDialog } from "@vueuse/core";
import { exportFile, useQuasar } from "quasar";
import { useI18n } from "vue-i18n";
import type { ExperimentVersionRelation } from "../api/experiment-file.api";
import {
  buildExperimentFileName,
  compareExperimentVersion,
  parseExperimentFile,
  serializeExperiment
} from "../api/experiment-file.api";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getManifest } from "@/features/atlas";

/**
 * Open and download the current experiment as a JSON file, notifying on
 * unreadable files, unreachable atlases, and failed downloads.
 */
export function useExperimentFile() {
  const $q = useQuasar();
  const { t } = useI18n();
  const currentExperimentStore = useCurrentExperimentStore();
  const { open: openFileDialog, onChange } = useFileDialog({
    accept: "application/json",
    multiple: false,
    reset: true
  });
  const openedHook = createEventHook<void>();

  /**
   * Notify that the picked file couldn't be read as an experiment.
   */
  function notifyInvalidExperimentFile() {
    $q.notify({
      message: t("experimentFile.invalidExperimentFile"),
      caption: t("experimentFile.invalidExperimentFileCaption"),
      color: "negative",
      icon: "error"
    });
  }

  /**
   * Notify that the browser refused the download.
   */
  function notifyDownloadFailed() {
    $q.notify({
      message: t("experimentFile.downloadFailed"),
      caption: t("experimentFile.downloadFailedCaption"),
      color: "negative",
      icon: "error"
    });
  }

  /**
   * Notify that the loaded experiment's atlas couldn't be fetched.
   */
  function notifyAtlasUnavailable() {
    $q.notify({
      message: t("experimentFile.atlasUnavailable"),
      caption: t("experimentFile.atlasUnavailableCaption"),
      color: "warning",
      icon: "warning"
    });
  }

  /**
   * Notify about a version mismatch between the loaded file and the running
   * Pinpoint version, if any. The file is always opened regardless.
   * @param relation How the file's version relates to the running one.
   * @param fileVersion Version recorded in the loaded file.
   */
  function notifyVersionMismatch(
    relation: ExperimentVersionRelation,
    fileVersion: string
  ) {
    if (relation === "match") return;

    const appVersion = import.meta.env.APP_VERSION;
    const messageKeys: Record<
      Exclude<ExperimentVersionRelation, "match">,
      { message: string; caption: string; color: "negative" | "warning" }
    > = {
      majorBehind: {
        message: "experimentFile.versionMajorBehind",
        caption: "experimentFile.versionMajorBehindCaption",
        color: "negative"
      },
      minorBehind: {
        message: "experimentFile.versionMinorBehind",
        caption: "experimentFile.versionMinorBehindCaption",
        color: "warning"
      },
      majorAhead: {
        message: "experimentFile.versionMajorAhead",
        caption: "experimentFile.versionMajorAheadCaption",
        color: "negative"
      },
      minorAhead: {
        message: "experimentFile.versionMinorAhead",
        caption: "experimentFile.versionMinorAheadCaption",
        color: "warning"
      },
      unknown: {
        message: "experimentFile.versionUnknown",
        caption: "experimentFile.versionUnknownCaption",
        color: "warning"
      }
    };

    const { message, caption, color } = messageKeys[relation];
    $q.notify({
      message: t(message),
      caption: t(caption, { fileVersion, appVersion }),
      color,
      icon: color === "negative" ? "error" : "warning"
    });
  }

  /**
   * Prompt for an experiment file to load into the current experiment.
   */
  function openExperiment() {
    openFileDialog();
  }

  /**
   * Download the current experiment as a JSON file.
   */
  function downloadExperiment() {
    const { experiment } = currentExperimentStore;
    const result = exportFile(
      buildExperimentFileName(experiment),
      serializeExperiment(experiment),
      "application/json"
    );

    if (result !== true) notifyDownloadFailed();
  }

  onChange(async files => {
    // `reset: true` fires a null change before opening the picker.
    const file = files?.[0];
    if (!file) return;

    try {
      const experiment = parseExperimentFile(await file.text());
      if (!experiment) {
        notifyInvalidExperimentFile();
        return;
      }

      notifyVersionMismatch(
        compareExperimentVersion(
          experiment.version,
          import.meta.env.APP_VERSION
        ),
        experiment.version
      );
      currentExperimentStore.loadExperiment(experiment);
      if (!(await getManifest(experiment.atlas))) notifyAtlasUnavailable();

      await openedHook.trigger();
    } catch {
      notifyInvalidExperimentFile();
    }
  });

  return { openExperiment, downloadExperiment, onOpened: openedHook.on };
}
