<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ValidationRule } from "quasar";
import CommittedInput from "@/components/CommittedInput.vue";
import { useCoordinateSystemValueModel } from "../composable/useCoordinateSystemValueModel";
import { useValidationRules } from "@/composable/useValidationRules";
import {
  type CoordinateSystemNodeComponent,
  type CoordinateSystemValue,
  type CoordinateSystemValueMode
} from "@/features/coordinate-system";

// One axis-mapping choice. `attrs` puts a stable aria-label on the rendered
// button (Quasar spreads it onto each `q-btn`).
interface AxisOption {
  label: string;
  value: number;
  toggleColor: string;
  attrs: { "aria-label": string };
}

// One constraint-mode choice for the value's mode toggle.
interface ModeOption {
  label: string;
  value: CoordinateSystemValueMode;
}

// A value name is optional: `buildFixedCoordinateSystemValue()` deliberately
// builds unnamed values.
const VALUE_NAME_RULES: ValidationRule<string>[] = [];

const { coordinateSystemValue, component } = defineProps<{
  coordinateSystemValue: CoordinateSystemValue;
  component: CoordinateSystemNodeComponent;
}>();
const axisIndex = defineModel<number>("axisIndex", { required: true });

const { optionalNumber: numberRules } = useValidationRules();
const { t } = useI18n();
const { value, suffix } = useCoordinateSystemValueModel(
  () => coordinateSystemValue,
  component
);

const name = computed({
  get: () => coordinateSystemValue.name,
  set: (value: string) => (coordinateSystemValue.name = value.trim())
});
const axisOptions = computed<AxisOption[]>(() => [
  {
    label: t("axis.x"),
    value: 0,
    toggleColor: "red",
    attrs: {
      "aria-label": t("coordinateSystemInspector.mapToAxis", {
        axis: t("axis.x")
      })
    }
  },
  {
    label: t("axis.y"),
    value: 1,
    toggleColor: "green",
    attrs: {
      "aria-label": t("coordinateSystemInspector.mapToAxis", {
        axis: t("axis.y")
      })
    }
  },
  {
    label: t("axis.z"),
    value: 2,
    toggleColor: "blue",
    attrs: {
      "aria-label": t("coordinateSystemInspector.mapToAxis", {
        axis: t("axis.z")
      })
    }
  }
]);
const modeOptions = computed<ModeOption[]>(() => [
  { label: t("coordinateSystemInspector.modeFree"), value: "free" },
  { label: t("coordinateSystemInspector.modeFixed"), value: "fixed" },
  { label: t("coordinateSystemInspector.modeUser"), value: "user" }
]);
</script>

<template>
  <div>
    <div class="column no-wrap q-gutter-y-sm">
      <CommittedInput
        v-model="name"
        hide-bottom-space
        :label="t('coordinateSystemInspector.valueName')"
        outlined
        :rules="VALUE_NAME_RULES"
      />
      <q-btn-toggle
        v-model="axisIndex"
        :aria-label="
          t('coordinateSystemInspector.axis', {
            name: coordinateSystemValue.name
          })
        "
        :options="axisOptions"
        spread
        toggle-color="primary"
      />
      <CommittedInput
        v-model="value"
        hide-bottom-space
        :label="t('coordinateSystemInspector.value')"
        outlined
        :rules="numberRules"
        :suffix="suffix"
      />
      <q-btn-toggle
        v-model="coordinateSystemValue.mode"
        :aria-label="
          t('coordinateSystemInspector.mode', {
            name: coordinateSystemValue.name
          })
        "
        :options="modeOptions"
        spread
        toggle-color="primary"
      />
    </div>
  </div>
</template>
