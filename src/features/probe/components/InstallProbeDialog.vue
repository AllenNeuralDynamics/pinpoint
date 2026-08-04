<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { computedAsync, useFileDialog } from "@vueuse/core";
import { useDialogPluginComponent } from "quasar";
import { useI18n } from "vue-i18n";
import { useFuzzyFilter } from "@/composable/useFuzzyFilter";
import { useNotify } from "@/composable/useNotify";
import {
  buildProbeOverviewImageSrc,
  getManufacturers,
  getProbeInterfaceProbe,
  getProbeNames,
  parseProbeInterfaceFile
} from "../api/install.api";
import {
  getManufacturerDisplayName,
  getProbeModelDisplayName
} from "../api/probe.api";

/** A selectable probe, pairing its identifier with a human-readable model name. */
interface ProbeOption {
  probeName: string;
  label: string;
}

defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } =
  useDialogPluginComponent();

const { t } = useI18n();
const { notifyError } = useNotify();
const { open: openFileDialog, onChange: onFileSelected } = useFileDialog({
  accept: "application/json",
  multiple: false,
  reset: true
});

const selectedManufacturerName = ref<string | null>(null);
const searchQuery = ref<string | null>(null);
const selectedProbeName = ref<string | null>(null);
const probeNamesEvaluating = ref(false);
const installing = ref(false);
const uploading = ref(false);

const manufacturers = computedAsync<string[]>(
  async () => await getManufacturers(),
  []
);

const probeNames = computedAsync<string[]>(
  async () => {
    if (!selectedManufacturerName.value) return [];
    return await getProbeNames(selectedManufacturerName.value);
  },
  [],
  probeNamesEvaluating
);

const probeOptions = computed<ProbeOption[]>(() => {
  const manufacturerName = selectedManufacturerName.value;
  if (!manufacturerName) return [];

  return probeNames.value.map(probeName => ({
    probeName,
    label: getProbeModelDisplayName(manufacturerName, probeName)
  }));
});

/** Fuzzy search across probe identifiers and labels. */
const { filtered: filteredProbeOptions } = useFuzzyFilter(
  computed(() => searchQuery.value ?? ""),
  probeOptions,
  { keys: ["probeName", "label"] }
);

const selectedProbeOverviewImageSrc = computed<string>(() => {
  if (!selectedManufacturerName.value || !selectedProbeName.value) return "";

  return buildProbeOverviewImageSrc(
    selectedManufacturerName.value,
    selectedProbeName.value
  );
});

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
    notifyError(
      t("installProbe.installFailed"),
      t("installProbe.installFailedCaption")
    );
    return;
  }

  onDialogOK(probe);
}

/**
 * Read and parse a probe interface file, or null when unreadable.
 * @param file File to read and parse.
 */
async function readProbeFile(file: File) {
  try {
    return parseProbeInterfaceFile(await file.text());
  } catch {
    return null;
  }
}

onFileSelected(async files => {
  // `reset: true` fires a null change before opening the picker.
  const file = files?.[0];
  if (!file) return;

  uploading.value = true;
  const probe = await readProbeFile(file);
  uploading.value = false;

  if (!probe) {
    notifyError(
      t("installProbe.invalidProbeFile"),
      t("installProbe.invalidProbeFileCaption")
    );
    return;
  }

  onDialogOK(probe);
});

watch(selectedManufacturerName, () => {
  selectedProbeName.value = null;
});
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="install-card">
      <q-card-section>
        <div class="text-h5">{{ $t("installProbe.title") }}</div>
      </q-card-section>
      <div
        class="install-card__body"
        :class="{ disabled: uploading || installing }"
      >
        <q-card-section
          class="q-gutter-y-sm install-card__content q-mt-none q-pt-none"
        >
          <q-select
            v-model="selectedManufacturerName"
            :label="$t('installProbe.manufacturer')"
            :option-label="getManufacturerDisplayName"
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
            <q-list class="fixed-dialog-list" separator>
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

          <q-btn
            :label="$t('installProbe.uploadCustom')"
            :loading="uploading"
            icon="upload"
            @click="openFileDialog()"
          />

          <q-btn
            :disable="!selectedProbeName"
            :label="$t('installProbe.install')"
            :loading="installing"
            icon="add"
            color="primary"
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

<style lang="sass" scoped>
.install-card
  min-width: 50vw
  display: flex
  flex-direction: column
  overflow: hidden

.install-card__body
  display: flex
  flex-direction: column
  flex: 1 1 auto
  min-height: 0
  overflow: hidden

.install-card__content
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
</style>
