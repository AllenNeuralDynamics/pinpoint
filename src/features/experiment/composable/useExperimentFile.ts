import { createEventHook, useFileDialog } from "@vueuse/core";
import { exportFile } from "quasar";
import { useI18n } from "vue-i18n";
import type { ExperimentVersionRelation } from "../api/experiment-file.api";
import {
  buildExperimentFileName,
  compareExperimentVersion,
  parseExperimentFile,
  serializeExperiment
} from "../api/experiment-file.api";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useNotify } from "@/composable/useNotify";

const VERSION_MISMATCH_NOTICES: Record<
  Exclude<ExperimentVersionRelation, "match">,
  { message: string; caption: string; severity: "error" | "warning" }
> = {
  majorBehind: {
    message: "experimentFile.versionMajorBehind",
    caption: "experimentFile.versionMajorBehindCaption",
    severity: "error"
  },
  minorBehind: {
    message: "experimentFile.versionMinorBehind",
    caption: "experimentFile.versionMinorBehindCaption",
    severity: "warning"
  },
  majorAhead: {
    message: "experimentFile.versionMajorAhead",
    caption: "experimentFile.versionMajorAheadCaption",
    severity: "error"
  },
  minorAhead: {
    message: "experimentFile.versionMinorAhead",
    caption: "experimentFile.versionMinorAheadCaption",
    severity: "warning"
  },
  unknown: {
    message: "experimentFile.versionUnknown",
    caption: "experimentFile.versionUnknownCaption",
    severity: "warning"
  }
};

/**
 * Open and download the current experiment as a JSON file, notifying on
 * unreadable files, unreachable atlases, and failed downloads.
 */
export function useExperimentFile() {
  const { t } = useI18n();
  const { notifyError, notifyWarning } = useNotify();
  const currentExperimentStore = useCurrentExperimentStore();
  const { open: openExperiment, onChange } = useFileDialog({
    accept: "application/json",
    multiple: false,
    reset: true
  });
  const openedHook = createEventHook<void>();

  /**
   * Notify that the picked file couldn't be read as an experiment.
   */
  function notifyInvalidExperimentFile() {
    notifyError(
      t("experimentFile.invalidExperimentFile"),
      t("experimentFile.invalidExperimentFileCaption")
    );
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

    const { message, caption, severity } = VERSION_MISMATCH_NOTICES[relation];
    const notify = severity === "error" ? notifyError : notifyWarning;
    notify(
      t(message),
      t(caption, { fileVersion, appVersion: import.meta.env.APP_VERSION })
    );
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

    if (result !== true) {
      notifyError(
        t("experimentFile.downloadFailed"),
        t("experimentFile.downloadFailedCaption")
      );
    }
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
      await openedHook.trigger();
    } catch {
      notifyInvalidExperimentFile();
    }
  });

  return { openExperiment, downloadExperiment, onOpened: openedHook.on };
}
