<script lang="ts" setup>
import { useQuasar } from "quasar";
import { useI18n } from "vue-i18n";
import {
  PERSISTED_STORES,
  resetPersistedStores,
  type PersistedStore
} from "../api/reset.api";

const $q = useQuasar();
const { t } = useI18n();

/**
 * Confirm, then delete one store's persisted data and reload.
 * @param store Persisted store to clear.
 */
function confirmClear(store: PersistedStore) {
  $q.dialog({
    title: t("preferences.confirmClearTitle"),
    message: t("preferences.confirmClear", { name: t(store.labelKey) }),
    cancel: true,
    persistent: true,
    ok: { label: t("preferences.confirmOk"), color: "negative" }
  }).onOk(() => {
    resetPersistedStores(localStorage, [store.key], () =>
      window.location.reload()
    );
  });
}

/** Confirm, then delete every store's persisted data and reload. */
function confirmResetAll() {
  $q.dialog({
    title: t("preferences.confirmResetAllTitle"),
    message: t("preferences.confirmResetAll"),
    cancel: true,
    persistent: true,
    ok: { label: t("preferences.confirmOk"), color: "negative" }
  }).onOk(() => {
    resetPersistedStores(
      localStorage,
      PERSISTED_STORES.map(({ key }) => key),
      () => window.location.reload()
    );
  });
}
</script>

<template>
  <div class="column q-gutter-y-md">
    <div class="text-caption">{{ $t("preferences.resetHint") }}</div>
    <q-list separator>
      <q-item v-for="store in PERSISTED_STORES" :key="store.key">
        <q-item-section>{{ $t(store.labelKey) }}</q-item-section>
        <q-item-section side>
          <q-btn
            :aria-label="$t('preferences.clear')"
            color="negative"
            flat
            icon="delete"
            round
            @click="confirmClear(store)"
          >
            <q-tooltip>{{ $t("preferences.clear") }}</q-tooltip>
          </q-btn>
        </q-item-section>
      </q-item>
    </q-list>
    <q-btn
      color="negative"
      icon="delete_forever"
      :label="$t('preferences.resetAll')"
      @click="confirmResetAll"
    />
  </div>
</template>
