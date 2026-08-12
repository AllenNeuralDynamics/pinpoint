<script lang="ts" setup>
import { computed } from "vue";
import { useQuasar } from "quasar";
import { useI18n } from "vue-i18n";
import type { Experiment } from "@/features/experiment";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";
import { useSyncStore } from "@/stores/sync.store";
import { partitionExperimentsByAuthor } from "../api/sync.api";

const emit = defineEmits<{ opened: [] }>();

const $q = useQuasar();
const { t } = useI18n();
const currentExperimentStore = useCurrentExperimentStore();
const recentExperimentsStore = useRecentExperimentsStore();
const syncStore = useSyncStore();

/** Recents split into the signed-in author's and other authors' on this computer. */
const partitioned = computed(() =>
  partitionExperimentsByAuthor(
    recentExperimentsStore.recents,
    syncStore.user?.orcid ?? ""
  )
);

/**
 * Open a recent experiment.
 * @param experiment Experiment to open.
 */
function onOpenRecent(experiment: Experiment) {
  recentExperimentsStore.remove(experiment);
  currentExperimentStore.loadExperiment(experiment);
  emit("opened");
}

/**
 * Prompt user to confirm before deletion.
 * @param experiment Experiment to delete.
 */
function onDeleteRecent(experiment: Experiment) {
  $q.dialog({
    title: t("recentExperiments.deleteExperiment"),
    message: t("recentExperiments.confirmDelete", { name: experiment.name }),
    cancel: true,
    persistent: true,
    ok: { label: t("recentExperiments.delete"), color: "negative" }
  }).onOk(() => {
    // Turning sync off keeps the next pull from restoring what was just deleted.
    syncStore.setSyncEnabled(experiment.id, false);
    recentExperimentsStore.remove(experiment);
  });
}
</script>

<template>
  <div class="row q-col-gutter-md items-start">
    <div class="col">
      <div class="text-subtitle2">{{ $t("sync.myExperiments") }}</div>
      <q-list v-if="partitioned.own.length" separator>
        <q-item
          v-for="experiment in partitioned.own"
          :key="experiment.id"
          v-ripple
          clickable
          @click="onOpenRecent(experiment)"
        >
          <q-item-section>{{ experiment.name }}</q-item-section>
          <q-item-section side>
            <div class="row items-center no-wrap">
              <q-toggle
                :aria-label="$t('sync.syncExperiment')"
                dense
                :model-value="syncStore.isSyncEnabled(experiment.id)"
                @click.stop
                @update:model-value="
                  value => syncStore.setSyncEnabled(experiment.id, value)
                "
              >
                <q-tooltip>{{ $t("sync.syncExperiment") }}</q-tooltip>
              </q-toggle>
              <q-btn
                class="sync-recents__delete-button"
                dense
                flat
                icon="delete"
                round
                @click.stop="onDeleteRecent(experiment)"
              />
            </div>
          </q-item-section>
        </q-item>
      </q-list>
      <div v-else class="text-caption q-pa-sm">
        {{ $t("recentExperiments.noRecents") }}
      </div>
    </div>

    <div v-if="partitioned.foreign.length" class="col">
      <div class="text-subtitle2">{{ $t("sync.otherAuthors") }}</div>
      <q-list separator>
        <q-item
          v-for="experiment in partitioned.foreign"
          :key="experiment.id"
          v-ripple
          clickable
          @click="onOpenRecent(experiment)"
        >
          <q-item-section>
            <q-item-label>{{ experiment.name }}</q-item-label>
            <q-item-label caption>
              {{ experiment.author?.name ?? $t("sync.unknownAuthor") }}
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-btn
              class="sync-recents__delete-button"
              dense
              flat
              icon="delete"
              round
              @click.stop="onDeleteRecent(experiment)"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </div>
  </div>
</template>

<style lang="sass" scoped>
.sync-recents__delete-button
  visibility: hidden

.q-item:hover .sync-recents__delete-button,
.q-item:focus-within .sync-recents__delete-button
  visibility: visible
</style>
