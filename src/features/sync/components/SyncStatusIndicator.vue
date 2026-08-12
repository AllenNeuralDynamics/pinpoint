<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useSyncStore } from "@/stores/sync.store";
import { useExperimentSync } from "../composable/useExperimentSync";

const { t } = useI18n();
const syncStore = useSyncStore();
const { syncNow } = useExperimentSync();

const isSyncing = computed(() => syncStore.status === "syncing");
const hasFailed = computed(() => syncStore.status === "failed");
const label = computed(() => {
  if (isSyncing.value) return t("sync.statusSyncing");
  if (hasFailed.value) return t("sync.statusFailed");
  if (syncStore.lastSyncedAt === null) return t("sync.statusNeverSynced");

  return t("sync.statusSynced", {
    time: new Date(syncStore.lastSyncedAt).toLocaleTimeString()
  });
});
</script>

<template>
  <div class="row items-center q-gutter-x-sm">
    <q-spinner v-if="isSyncing" size="sm" />
    <q-icon
      v-else
      :name="hasFailed ? 'sync_problem' : 'cloud_done'"
      :color="hasFailed ? 'negative' : 'positive'"
      size="sm"
    />
    <span class="text-caption" role="status" aria-live="polite">
      {{ label }}
    </span>
    <q-btn
      v-if="!isSyncing"
      dense
      flat
      no-caps
      size="sm"
      icon="refresh"
      :label="$t('sync.syncNow')"
      @click="syncNow()"
    />
  </div>
</template>
