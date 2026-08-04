<script lang="ts" setup>
import { useDialogPluginComponent, useQuasar } from "quasar";
import {
  NewExperimentDialog,
  RecentExperimentsList,
  useExperimentFile
} from "@/features/experiment";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";

const appVersion = import.meta.env.APP_VERSION;
const BASE_URL = import.meta.env.BASE_URL;

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
const $q = useQuasar();
const { openExperiment, onOpened } = useExperimentFile();
const recentExperimentStore = useRecentExperimentsStore();

onOpened(onDialogOK);
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="splash">
      <q-card-section class="column full-width items-center">
        <p class="text-h2">{{ $t("splash.title") }}</p>
        <i class="text-caption">{{ appVersion }}</i>
      </q-card-section>

      <q-card-section>
        <div class="column q-gutter-y-md">
          <div class="row q-gutter-x-md justify-center">
            <q-btn
              icon="add"
              :label="$t('splash.new')"
              size="xl"
              @click="
                $q.dialog({ component: NewExperimentDialog }).onOk(onDialogOK)
              "
            />
            <q-btn
              v-close-popup
              color="primary"
              icon="play_arrow"
              :label="$t('splash.resume')"
              size="xl"
            />
            <q-btn
              icon="file_open"
              :label="$t('splash.open')"
              size="xl"
              @click="() => openExperiment()"
            />
          </div>
          <div class="row q-gutter-x-md justify-center">
            <q-btn
              :label="$t('splash.userGuide')"
              :href="`${BASE_URL}docs`"
              icon="menu_book"
            />
            <q-btn
              :label="$t('splash.vblWebsite')"
              href="https://virtualbrainlab.org/index.html"
              icon="web"
            />
          </div>
        </div>
      </q-card-section>

      <q-card-section v-if="recentExperimentStore.recents.length > 0">
        <RecentExperimentsList @opened="onDialogOK" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.splash
  min-width: 30vw
  max-height: 70vh
</style>
