<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type {
  CoordinateSystem,
  CoordinateSystemNodeComponent
} from "@/features/coordinate-system";
import { useCoordinateSystemLibraryStore } from "@/stores/coordinate-system-library.store";
import CoordinateSystemNumericInput from "./CoordinateSystemNumericInput.vue";

const COMPONENTS = ["position", "rotation"] as const;
const AXES = {
  position: ["axis.ml", "axis.dv", "axis.ap"],
  rotation: ["axis.pitch", "axis.yaw", "axis.roll"]
} as const;
const { coordinateSystem } = defineProps<{
  coordinateSystem: CoordinateSystem;
}>();
const emit = defineEmits<{
  focus: [component: CoordinateSystemNodeComponent];
}>();
const { t } = useI18n();
const library = useCoordinateSystemLibraryStore();
const sharingLabel = computed(() =>
  t(
    coordinateSystem.brainTransform.shared
      ? "coordinateSystemInspector.unlockBrainTransform"
      : "coordinateSystemInspector.lockBrainTransform"
  )
);
</script>

<template>
  <q-card flat bordered class="brain-transform q-pa-sm">
    <div class="row items-center no-wrap q-mb-sm">
      <q-icon name="psychology" color="primary" size="sm" class="q-mr-sm" />
      <div class="col text-weight-bold">{{
        t("coordinateSystemInspector.brainTransform")
      }}</div>
      <q-btn
        flat
        round
        dense
        icon="help_outline"
        :aria-label="t('coordinateSystemInspector.brainTransformHelp')"
      >
        <q-tooltip>{{
          t("coordinateSystemInspector.brainTransformHelp")
        }}</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        :icon="coordinateSystem.brainTransform.shared ? 'lock' : 'lock_open'"
        :aria-pressed="coordinateSystem.brainTransform.shared"
        :aria-label="sharingLabel"
        @click="
          library.setBrainTransformShared(
            coordinateSystem,
            !coordinateSystem.brainTransform.shared
          )
        "
      >
        <q-tooltip>{{ sharingLabel }}</q-tooltip>
      </q-btn>
    </div>
    <div
      v-for="component in COMPONENTS"
      :key="component"
      class="q-mt-sm"
      @focusin="emit('focus', component)"
    >
      <div class="text-caption q-mb-xs">{{
        t(`coordinateSystemInspector.${component}`)
      }}</div>
      <div class="row q-col-gutter-xs">
        <CoordinateSystemNumericInput
          v-for="(entry, axis) in coordinateSystem.brainTransform[component]"
          :key="axis"
          class="col"
          :entry="entry"
          :component="component"
          :label="t(AXES[component][axis]!)"
        />
      </div>
    </div>
  </q-card>
</template>

<style scoped lang="sass">
.brain-transform
  border-left: 3px solid var(--q-primary)
  background: color-mix(in srgb, var(--q-primary) 8%, transparent)
</style>
