<script lang="ts" setup>
import { useFileDialog } from "@vueuse/core";
import { exportFile } from "quasar";
import { useI18n } from "vue-i18n";
import {
  PREFERENCES_FILE_NAME,
  applyPreferences,
  parsePreferencesFile,
  serializePreferences
} from "../api/preferences-file.api";
import { useNotify } from "@/composable/useNotify";
import { usePreferencesStore } from "@/stores/preferences.store";
import { compareFileVersion, type VersionRelation } from "@/utils/version";

const VERSION_MISMATCH_NOTICES: Record<
  Exclude<VersionRelation, "match">,
  { message: string; caption: string; severity: "error" | "warning" }
> = {
  majorBehind: {
    message: "preferences.versionMajorBehind",
    caption: "preferences.versionMajorBehindCaption",
    severity: "error"
  },
  minorBehind: {
    message: "preferences.versionMinorBehind",
    caption: "preferences.versionMinorBehindCaption",
    severity: "warning"
  },
  majorAhead: {
    message: "preferences.versionMajorAhead",
    caption: "preferences.versionMajorAheadCaption",
    severity: "error"
  },
  minorAhead: {
    message: "preferences.versionMinorAhead",
    caption: "preferences.versionMinorAheadCaption",
    severity: "warning"
  },
  unknown: {
    message: "preferences.versionUnknown",
    caption: "preferences.versionUnknownCaption",
    severity: "warning"
  }
};

const { t } = useI18n();
const { notifyError, notifyWarning, notifySuccess } = useNotify();
const preferences = usePreferencesStore();
const { open: openFileDialog, onChange: onFileSelected } = useFileDialog({
  accept: "application/json",
  multiple: false,
  reset: true
});

/** Download the current preferences as a JSON file. */
function downloadPreferences() {
  const result = exportFile(
    PREFERENCES_FILE_NAME,
    serializePreferences(preferences),
    "application/json"
  );

  if (result !== true) {
    notifyError(
      t("preferences.downloadFailed"),
      t("preferences.downloadFailedCaption")
    );
  }
}

/** Notify that the picked file couldn't be read as preferences. */
function notifyInvalidPreferencesFile() {
  notifyError(
    t("preferences.invalidPreferencesFile"),
    t("preferences.invalidPreferencesFileCaption")
  );
}

/**
 * Notify about a version mismatch between the uploaded file and the running
 * Pinpoint version, if any. The values are always applied regardless.
 * @param relation How the file's version relates to the running one.
 * @param fileVersion Version recorded in the uploaded file.
 */
function notifyVersionMismatch(relation: VersionRelation, fileVersion: string) {
  if (relation === "match") return;

  const { message, caption, severity } = VERSION_MISMATCH_NOTICES[relation];
  const notify = severity === "error" ? notifyError : notifyWarning;
  notify(
    t(message),
    t(caption, { fileVersion, appVersion: import.meta.env.APP_VERSION })
  );
}

onFileSelected(async files => {
  // `reset: true` fires a null change before opening the picker.
  const file = files?.[0];
  if (!file) return;

  try {
    const uploaded = parsePreferencesFile(await file.text());
    if (!uploaded) {
      notifyInvalidPreferencesFile();
      return;
    }

    const relation = compareFileVersion(
      uploaded.version,
      import.meta.env.APP_VERSION
    );
    notifyVersionMismatch(relation, uploaded.version);
    applyPreferences(preferences, uploaded, import.meta.env.APP_VERSION);

    // A mismatch notice already confirms the values were applied, so the
    // success toast would only duplicate it.
    if (relation === "match") {
      notifySuccess(
        t("preferences.preferencesImported"),
        t("preferences.preferencesImportedCaption")
      );
    }
  } catch {
    notifyInvalidPreferencesFile();
  }
});
</script>

<template>
  <div class="column q-gutter-y-md">
    <div class="text-caption">{{ $t("preferences.exportHint") }}</div>
    <q-btn
      color="primary"
      icon="download"
      :label="$t('preferences.downloadPreferences')"
      @click="downloadPreferences"
    />
    <q-btn
      color="primary"
      icon="upload"
      :label="$t('preferences.uploadPreferences')"
      @click="openFileDialog()"
    />
  </div>
</template>
