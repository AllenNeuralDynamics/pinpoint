<script lang="ts" setup>
import { ref } from "vue";
import { useDialogPluginComponent } from "quasar";
import ScenePreferences from "./ScenePreferences.vue";
import ProbePreferences from "./ProbePreferences.vue";
import ResetPreferences from "./ResetPreferences.vue";
import type { PreferencesDialogResult } from "../models/preferences-dialog.model";

defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK } =
  useDialogPluginComponent<PreferencesDialogResult>();

const tab = ref("scene");
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="preferences">
      <q-card-section>
        <div class="text-h5">{{ $t("preferences.title") }}</div>
      </q-card-section>
      <q-card-section class="column no-wrap preferences__content q-pt-none">
        <q-tabs v-model="tab">
          <q-tab name="scene" :label="$t('preferences.scene')" />
          <q-tab name="probe" :label="$t('preferences.probe')" />
          <q-tab name="reset" :label="$t('preferences.reset')" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="tab" animated class="col preferences__panels">
          <q-tab-panel name="scene">
            <ScenePreferences @open-world-editor="onDialogOK('world-editor')" />
          </q-tab-panel>
          <q-tab-panel name="probe"><ProbePreferences /></q-tab-panel>
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
  min-width: 40vw
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
