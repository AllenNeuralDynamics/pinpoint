import { createEventHook, useFileDialog } from "@vueuse/core";
import { exportFile } from "quasar";
import { useI18n } from "vue-i18n";
import {
  buildExperimentFileName,
  EXPERIMENT_FILE_MIME_TYPE,
  type SceneModelFile,
  unzipExperiment,
  zipExperiment
} from "../api/experiment-file.api";
import { getExperimentModelIds } from "../api/experiment.api";
import { getSceneModel, putSceneModel } from "@/features/scene";
import { useNotify } from "@/composable/useNotify";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { compareFileVersion, type VersionRelation } from "@/utils/version";

const VERSION_MISMATCH_NOTICES: Record<
  Exclude<VersionRelation, "match">,
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
 * Open and download the current experiment as a zip file, notifying on
 * unreadable files, unreachable atlases, and failed downloads.
 */
export function useExperimentFile() {
  const { t } = useI18n();
  const { notifyError, notifyWarning } = useNotify();
  const currentExperimentStore = useCurrentExperimentStore();
  const { open: openExperiment, onChange } = useFileDialog({
    accept: ".zip,application/zip",
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
    relation: VersionRelation,
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
   * Download the current experiment as a zip file containing its JSON and
   * one model file per referenced scene model still in IndexedDB.
   */
  async function downloadExperiment() {
    const { experiment } = currentExperimentStore;
    const models = new Map<string, SceneModelFile>();
    for (const id of getExperimentModelIds(experiment)) {
      const modelFile = await getSceneModel(id);
      if (modelFile) {
        models.set(id, {
          fileName: modelFile.name,
          bytes: new Uint8Array(await modelFile.arrayBuffer())
        });
      }
    }

    const result = exportFile(
      buildExperimentFileName(experiment),
      zipExperiment(experiment, models),
      EXPERIMENT_FILE_MIME_TYPE
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
      const archive = unzipExperiment(new Uint8Array(await file.arrayBuffer()));
      if (!archive) {
        notifyInvalidExperimentFile();
        return;
      }

      // Written before `loadExperiment`, so the scene sync's first run finds them.
      for (const [id, { fileName, bytes }] of archive.models) {
        await putSceneModel(id, new File([bytes.slice()], fileName));
      }

      notifyVersionMismatch(
        compareFileVersion(
          archive.experiment.version,
          import.meta.env.APP_VERSION
        ),
        archive.experiment.version
      );
      currentExperimentStore.loadExperiment(archive.experiment);
      await openedHook.trigger();
    } catch {
      notifyInvalidExperimentFile();
    }
  });

  return { openExperiment, downloadExperiment, onOpened: openedHook.on };
}
