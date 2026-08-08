<script lang="ts" setup>
import { useDialogPluginComponent } from "quasar";
import GeneralPreferences from "./GeneralPreferences.vue";
import ScenePreferences from "./ScenePreferences.vue";
import ProbePreferences from "./ProbePreferences.vue";
import ExportPreferences from "./ExportPreferences.vue";
import ResetPreferences from "./ResetPreferences.vue";
import type { PreferencesTab } from "../models/preferences-dialog.model";

defineEmits([...useDialogPluginComponent.emits]);
const tab = defineModel<PreferencesTab>("tab", { default: "general" });
const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="preferences fixed-dialog-card">
      <q-card-section>
        <div class="text-h5">{{ $t("preferences.title") }}</div>
      </q-card-section>
      <q-card-section class="column no-wrap preferences__content q-pt-none">
        <q-tabs v-model="tab">
          <q-tab name="general" :label="$t('preferences.general')" />
          <q-tab name="scene" :label="$t('preferences.scene')" />
          <q-tab name="probe" :label="$t('preferences.probe')" />
          <q-tab name="export" :label="$t('preferences.export')" />
          <q-tab name="reset" :label="$t('preferences.reset')" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="tab" animated class="col preferences__panels">
          <q-tab-panel name="general"><GeneralPreferences /></q-tab-panel>
          <q-tab-panel name="scene">
            <ScenePreferences @inspect-world="onDialogOK()" />
          </q-tab-panel>
          <q-tab-panel name="probe"><ProbePreferences /></q-tab-panel>
          <q-tab-panel name="export"><ExportPreferences /></q-tab-panel>
          <q-tab-panel name="reset"><ResetPreferences /></q-tab-panel>
        </q-tab-panels>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          color="primary"
          :label="$t('preferences.close')"
          @click="onDialogOK()"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.preferences
  height: 80vh
  display: flex
  flex-direction: column
  overflow: hidden

.preferences__content
  flex: 1 1 auto
  min-height: 0

.preferences__panels
  overflow-y: auto !important
</style>
