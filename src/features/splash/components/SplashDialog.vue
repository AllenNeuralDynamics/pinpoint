<script lang="ts" setup>
import { useDialogPluginComponent, useQuasar } from "quasar";
import { NewExperimentDialog } from "@/features/experiment";

const appVersion = import.meta.env.APP_VERSION;

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK } = useDialogPluginComponent();
const $q = useQuasar();
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="splash">
      <q-card-section class="column full-width items-center">
        <p class="text-h2">Pinpoint V</p>
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
            <q-btn icon="file_open" :label="$t('splash.open')" size="xl" />
          </div>
          <div class="row q-gutter-x-md justify-center">
            <q-btn icon="menu_book" :label="$t('splash.userGuide')" />
            <q-btn icon="web" :label="$t('splash.vblWebsite')" />
          </div>
        </div>
      </q-card-section>

      <q-card-section>
        <q-scroll-area class="recents-list">
          <q-list separator>
            <q-item v-for="n in 20" :key="n" v-ripple clickable>
              <q-item-section>{{
                $t("splash.recentExperiment", { n })
              }}</q-item-section>
            </q-item>
          </q-list>
        </q-scroll-area>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style lang="sass" scoped>
.splash
  min-width: 30vw
  max-height: 70vh

.recents-list
  height: 30vh
</style>
