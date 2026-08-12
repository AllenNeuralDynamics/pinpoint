<script lang="ts" setup>
import { useSyncStore } from "@/stores/sync.store";
import { useExperimentSync } from "../composable/useExperimentSync";

const syncStore = useSyncStore();
const { signIn, signOut } = useExperimentSync();
</script>

<template>
  <div class="column q-gutter-y-md">
    <div v-if="syncStore.user" class="column q-gutter-y-sm">
      <div>
        {{ $t("sync.signedInAs", { name: syncStore.user.name }) }}
      </div>
      <div class="text-caption">{{ syncStore.user.orcid }}</div>
      <div class="text-caption">{{ $t("sync.signedInHint") }}</div>
      <q-btn
        class="self-start"
        icon="logout"
        :label="$t('sync.signOut')"
        @click="signOut()"
      />
    </div>
    <div v-else class="column q-gutter-y-sm">
      <div class="text-caption">{{ $t("sync.signedOutHint") }}</div>
      <q-btn
        class="self-start"
        color="primary"
        icon="sync"
        :label="$t('sync.signIn')"
        @click="signIn()"
      />
    </div>
  </div>
</template>
