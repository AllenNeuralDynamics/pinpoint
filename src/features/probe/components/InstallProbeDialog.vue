<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch } from "vue";
import { computedAsync } from "@vueuse/core";
import { useFuse } from "@vueuse/integrations/useFuse";
import { useDialogPluginComponent, useQuasar } from "quasar";
import { useI18n } from "vue-i18n";
import {
  buildProbeOverviewImageSrc,
  getProbeInterfaceProbe,
  getProbeNames,
  getVendors,
  parseProbeInterfaceFile
} from "../api/install-probe.api";

// Setup dialog.
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } =
  useDialogPluginComponent();

const $q = useQuasar();
const { t } = useI18n();

const selectedVendorName = ref<string | null>(null);
const searchQuery = ref<string | null>(null);
const selectedProbeName = ref<string | null>(null);
const probeNamesEvaluating = ref(false);

// Loading state for the two ways to resolve the dialog.
const installing = ref(false);
const uploading = ref(false);

const fileInput = useTemplateRef<HTMLInputElement>("file-input");

const vendors = computedAsync<string[]>(async () => await getVendors());

const probeNames = computedAsync<string[]>(
  async () => {
    if (!selectedVendorName.value) return [];
    return await getProbeNames(selectedVendorName.value);
  },
  [],
  probeNamesEvaluating
);

// Fuzzy search across probe names, falling back to the full list when empty.
const unwrappedSearchQuery = computed(() => searchQuery.value ?? "");
const { results: probeNameFuse } = useFuse(unwrappedSearchQuery, probeNames, {
  fuseOptions: {}
});
const filteredProbeNames = computed(() =>
  searchQuery.value
    ? probeNameFuse.value.map(result => result.item)
    : probeNames.value
);

const selectedProbeOverviewImageSrc = computed<string>(() => {
  if (!selectedVendorName.value || !selectedProbeName.value) return "";

  return buildProbeOverviewImageSrc(
    selectedVendorName.value,
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
  if (!selectedVendorName.value || !selectedProbeName.value) return;

  installing.value = true;
  const probe = await getProbeInterfaceProbe(
    selectedVendorName.value,
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

watch(selectedVendorName, () => {
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
            v-model="selectedVendorName"
            :label="$t('installProbe.vendor')"
            :options="vendors"
          />

          <template v-if="selectedVendorName">
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
                  v-for="probeName in filteredProbeNames"
                  :key="probeName"
                  v-ripple
                  :active="selectedProbeName === probeName"
                  clickable
                  @click="selectedProbeName = probeName"
                >
                  <q-item-section>{{ probeName }}</q-item-section>
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
