<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch } from "vue";
import { computedAsync } from "@vueuse/core";
import { useFuse } from "@vueuse/integrations/useFuse";
import { useDialogPluginComponent, useQuasar } from "quasar";
import { useI18n } from "vue-i18n";
import {
  buildProbeOverviewImageSrc,
  getManufacturers,
  getProbeInterfaceProbe,
  getProbeNames,
  parseProbeInterfaceFile
} from "../api/install-probe.api";
import { KNOWN_PROBES } from "../models/known-probes.model";

// A selectable probe, pairing its identifier with a human-readable label
// (falling back to the identifier itself when not in KNOWN_PROBES).
interface ProbeOption {
  probeName: string;
  label: string;
}

// Setup dialog.
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } =
  useDialogPluginComponent();

const $q = useQuasar();
const { t } = useI18n();

const selectedManufacturerName = ref<string | null>(null);
const searchQuery = ref<string | null>(null);
const selectedProbeName = ref<string | null>(null);
const probeNamesEvaluating = ref(false);

// Loading state for the two ways to resolve the dialog.
const installing = ref(false);
const uploading = ref(false);

const fileInput = useTemplateRef<HTMLInputElement>("file-input");

const manufacturers = computedAsync<string[]>(
  async () => await getManufacturers()
);

const probeNames = computedAsync<string[]>(
  async () => {
    if (!selectedManufacturerName.value) return [];
    return await getProbeNames(selectedManufacturerName.value);
  },
  [],
  probeNamesEvaluating
);

const probeOptions = computed<ProbeOption[]>(() =>
  probeNames.value.map(probeName => ({
    probeName,
    label:
      KNOWN_PROBES[`${selectedManufacturerName.value} ${probeName}`]?.trim() ??
      probeName
  }))
);

// Fuzzy search across probe identifiers and labels, falling back to the full
// list when empty.
const unwrappedSearchQuery = computed(() => searchQuery.value ?? "");
const { results: probeOptionFuse } = useFuse(
  unwrappedSearchQuery,
  probeOptions,
  {
    fuseOptions: { keys: ["probeName", "label"] }
  }
);
const filteredProbeOptions = computed(() =>
  searchQuery.value
    ? probeOptionFuse.value.map(result => result.item)
    : probeOptions.value
);

const selectedProbeOverviewImageSrc = computed<string>(() => {
  if (!selectedManufacturerName.value || !selectedProbeName.value) return "";

  return buildProbeOverviewImageSrc(
    selectedManufacturerName.value,
    selectedProbeName.value
  );
});

/**
 * Notify that installing or reading a probe failed.
 */
function notifyInstallFailed() {
  $q.notify({
    message: t("installProbe.installFailed"),
    caption: t("installProbe.installFailedCaption"),
    color: "negative",
    icon: "error"
  });
}

/**
 * Fetch the selected probe from the library and resolve the dialog with it.
 */
async function install() {
  if (!selectedManufacturerName.value || !selectedProbeName.value) return;

  installing.value = true;
  const probe = await getProbeInterfaceProbe(
    selectedManufacturerName.value,
    selectedProbeName.value
  );
  installing.value = false;

  if (!probe) {
    notifyInstallFailed();
    return;
  }

  onDialogOK(probe);
}

/**
 * Open the hidden file input to let the user pick a custom probe file.
 */
function openFilePicker() {
  fileInput.value?.click();
}

/**
 * Read the selected file, validate it as a ProbeInterface file, and resolve
 * the dialog with its first probe. Notifies an error if the file can't be
 * read or parsed.
 */
async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  // Reset so re-selecting the same file still fires `change`.
  input.value = "";

  if (!file) return;

  uploading.value = true;
  try {
    const text = await file.text();
    const probe = parseProbeInterfaceFile(text);

    if (!probe) {
      $q.notify({
        message: t("installProbe.invalidProbeFile"),
        caption: t("installProbe.invalidProbeFileCaption"),
        color: "negative",
        icon: "error"
      });
      return;
    }

    onDialogOK(probe);
  } catch {
    $q.notify({
      message: t("installProbe.invalidProbeFile"),
      caption: t("installProbe.invalidProbeFileCaption"),
      color: "negative",
      icon: "error"
    });
  } finally {
    uploading.value = false;
  }
}

watch(selectedManufacturerName, () => {
  selectedProbeName.value = null;
});
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="install-card">
      <div :class="{ disabled: uploading || installing }">
        <q-card-section class="q-gutter-y-sm">
          <p class="text-h5">{{ $t("installProbe.title") }}</p>

          <q-select
            v-model="selectedManufacturerName"
            :label="$t('installProbe.manufacturer')"
            :options="manufacturers"
          />

          <template v-if="selectedManufacturerName">
            <q-input
              v-model="searchQuery"
              :label="$t('installProbe.search')"
              clearable
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>
            <q-list class="dialog-list" separator>
              <template v-if="probeNamesEvaluating">
                <q-item v-for="n in 5" :key="n">
                  <q-item-section>
                    <q-skeleton type="text" />
                  </q-item-section>
                </q-item>
              </template>
              <template v-else>
                <q-item
                  v-for="probeOption in filteredProbeOptions"
                  :key="probeOption.probeName"
                  v-ripple
                  :active="selectedProbeName === probeOption.probeName"
                  clickable
                  @click="selectedProbeName = probeOption.probeName"
                >
                  <q-item-section>{{ probeOption.label }}</q-item-section>
                </q-item>
              </template>
            </q-list>

            <q-img
              v-if="selectedProbeName"
              :src="selectedProbeOverviewImageSrc"
              fit="contain"
            />
          </template>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn :label="$t('installProbe.cancel')" @click="onDialogCancel" />

          <input
            ref="file-input"
            accept="application/json"
            class="hidden"
            type="file"
            @change="onFileSelected"
          />
          <q-btn
            :label="$t('installProbe.uploadCustom')"
            :loading="uploading"
            icon="upload"
            @click="openFilePicker"
          />

          <q-btn
            :disable="!selectedProbeName"
            :label="$t('installProbe.install')"
            :loading="installing"
            color="primary"
            icon="add"
            @click="install"
          >
            <q-tooltip v-if="!selectedProbeName">{{
              $t("installProbe.selectProbeHint")
            }}</q-tooltip>
          </q-btn>
        </q-card-actions>
      </div>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped></style>
