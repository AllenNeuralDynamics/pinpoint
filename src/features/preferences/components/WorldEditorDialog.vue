<script lang="ts" setup>
import { useDialogPluginComponent } from "quasar";
import WorldPreferences from "./WorldPreferences.vue";

defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
</script>

<template>
  <q-dialog ref="dialogRef" seamless position="bottom" @hide="onDialogHide">
    <q-card class="world-editor">
      <q-card-section>
        <div class="text-h5">{{ $t("preferences.world") }}</div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <WorldPreferences />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          color="primary"
          :label="$t('preferences.done')"
          @click="onDialogOK()"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.world-editor
  min-width: 780px
</style>
