<script lang="ts" setup>
import { toRef } from "vue";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useClampedNumberModel } from "../composable/useClampedNumberModel";

const preferences = usePreferencesStore();

const decimalPrecision = useClampedNumberModel(
  toRef(preferences, "decimalPrecision"),
  0,
  10
);
</script>

<template>
  <div>
    <div class="text-h6">{{ $t("preferences.unitsTitle") }}</div>
    <div class="column q-gutter-y-md">
      <div>
        <div class="text-body2 q-pb-xs">{{
          $t("preferences.positionUnit")
        }}</div>
        <q-btn-toggle
          v-model="preferences.positionUnit"
          :aria-label="$t('preferences.positionUnit')"
          no-caps
          :options="[
            { label: $t('units.micrometer'), value: 'micrometer' },
            { label: $t('units.millimeter'), value: 'millimeter' },
            { label: $t('units.centimeter'), value: 'centimeter' }
          ]"
          spread
          toggle-color="primary"
        />
      </div>
      <div>
        <div class="text-body2 q-pb-xs">{{
          $t("preferences.rotationUnit")
        }}</div>
        <q-btn-toggle
          v-model="preferences.rotationUnit"
          :aria-label="$t('preferences.rotationUnit')"
          no-caps
          :options="[
            { label: $t('units.degree'), value: 'degree' },
            { label: $t('units.radian'), value: 'radian' }
          ]"
          spread
          toggle-color="primary"
        />
      </div>
      <q-input
        v-model="decimalPrecision"
        :label="$t('preferences.decimalPrecision')"
        :max="10"
        :min="0"
        dense
        outlined
      />
    </div>
  </div>
</template>
