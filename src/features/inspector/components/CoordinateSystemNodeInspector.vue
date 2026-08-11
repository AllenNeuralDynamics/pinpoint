<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { CoordinateSystemNode } from "@/features/coordinate-system";
import CommittedInput from "@/components/CommittedInput.vue";
import { useValidationRules } from "@/composable/useValidationRules";
import CoordinateSystemValueList from "./CoordinateSystemValueList.vue";

const { node } = defineProps<{
  node: CoordinateSystemNode;
}>();

const emit = defineEmits<{
  "update:onSurface": [onSurface: boolean];
  focus: [];
  delete: [];
  dragStart: [event: DragEvent];
  dragEnd: [];
}>();

const { requiredName: nodeNameRules } = useValidationRules();
const { t } = useI18n();

const name = computed({
  get: () => node.name,
  set: (value: string) => (node.name = value.trim())
});

const isOnSurface = computed({
  get: () => node.onSurface,
  set: (value: boolean) => emit("update:onSurface", value)
});
</script>

<template>
  <q-expansion-item default-opened header-class="text-weight-bold">
    <template #header>
      <q-item-section side>
        <div
          class="node-row__handle"
          draggable="true"
          :title="t('coordinateSystemInspector.dragToReorder')"
          @click.stop
          @dragend="emit('dragEnd')"
          @dragstart.stop="emit('dragStart', $event)"
        >
          <q-icon name="drag_indicator" size="sm" />
        </div>
      </q-item-section>
      <q-item-section avatar>
        <q-icon name="sym_o_transform" />
      </q-item-section>
      <q-item-section>
        <q-item-label>{{ node.name }}</q-item-label>
      </q-item-section>
    </template>
    <div class="q-py-md" @click="emit('focus')" @focusin="emit('focus')">
      <div class="column no-wrap q-gutter-y-md">
        <CommittedInput
          v-model="name"
          hide-bottom-space
          :label="t('coordinateSystemInspector.nodeName')"
          outlined
          :rules="nodeNameRules"
        />
        <q-toggle
          v-model="isOnSurface"
          :label="t('coordinateSystemInspector.surfaceCoordinate')"
        />
        <CoordinateSystemValueList
          component="position"
          :label="t('coordinateSystemInspector.position')"
          :node="node"
        />
        <CoordinateSystemValueList
          component="rotation"
          :label="t('coordinateSystemInspector.rotation')"
          :node="node"
        />
        <q-btn
          class="full-width"
          color="negative"
          icon="delete"
          :label="t('coordinateSystemInspector.deleteTransform')"
          @click.stop="emit('delete')"
        />
      </div>
    </div>
  </q-expansion-item>
</template>

<style lang="sass" scoped>
.node-row__handle
  cursor: grab
  display: flex
</style>
