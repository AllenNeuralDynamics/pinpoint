<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { CoordinateSystemNode } from "@/features/coordinate-system";
import ProbeTransformValueRow from "./ProbeTransformValueRow.vue";

const { chain, disable, offSurfaceNodeIndexes } = defineProps<{
  chain: CoordinateSystemNode[];
  disable: boolean;
  offSurfaceNodeIndexes: number[];
}>();
const emit = defineEmits<{ commit: [] }>();

const { t } = useI18n();

const visibleNodes = computed(() =>
  chain
    .map((node, index) => ({ node, index }))
    .filter(
      ({ node, index }) =>
        offSurfaceNodeIndexes.includes(index) ||
        node.position.some(({ fixed }) => !fixed) ||
        node.rotation.some(({ fixed }) => !fixed)
    )
);
</script>

<template>
  <q-list separator>
    <q-item v-for="{ node, index } of visibleNodes" :key="index">
      <q-item-section>
        <div class="column no-wrap q-gutter-y-sm">
          <div class="text-body2 text-weight-bold">{{ node.name }}</div>
          <div
            v-if="offSurfaceNodeIndexes.includes(index)"
            class="text-caption text-warning"
          >
            {{ t("probeInspector.offSurface") }}
          </div>
          <ProbeTransformValueRow
            component="position"
            :disable="disable"
            :label="t('probeInspector.position')"
            :node="node"
            @commit="emit('commit')"
          />
          <ProbeTransformValueRow
            component="rotation"
            :disable="disable"
            :label="t('probeInspector.rotation')"
            :node="node"
            @commit="emit('commit')"
          />
        </div>
      </q-item-section>
    </q-item>
  </q-list>
</template>
