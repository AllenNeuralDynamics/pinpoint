<script lang="ts" setup>
import { useDialogPluginComponent } from "quasar";
import RecentExperimentsList from "./RecentExperimentsList.vue";

defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="recent-experiments">
      <q-card-section>
        <p class="text-h5">{{ $t("recentExperiments.title") }}</p>
        <RecentExperimentsList @opened="onDialogOK" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          color="primary"
          :label="$t('recentExperiments.close')"
          @click="onDialogOK"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.recent-experiments
  min-width: 30vw
</style>
