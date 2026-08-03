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
        <div class="text-h5">{{ $t("recentExperiments.title") }}</div>
      </q-card-section>
      <q-card-section class="recent-experiments__content">
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
  display: flex
  flex-direction: column
  overflow: hidden

.recent-experiments__content
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
</style>
