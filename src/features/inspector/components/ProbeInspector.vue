<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type ValidationRule } from "quasar";
import {
  findProbeInterfaceProbeByIdentifier,
  getProbeInterfaceIdentifier,
  Probe
} from "@/features/probe";
import { STANDARD_COLORS } from "@/features/scene";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { setProbeInterface } from "@/features/experiment";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import CommittedInput from "./CommittedInput.vue";

const { probe } = defineProps<{
  probe: Probe;
}>();

const probeLibraryStore = useProbeLibraryStore();
const currentExperimentStore = useCurrentExperimentStore();

const { t } = useI18n();

/**
 * Link to the probe identifier that also repoints its interned interface
 * definition after switching.
 */
const probeIdentifier = computed({
  get: () => probe.probeInterfaceIdentifier,
  set: (value: string) => {
    const probeInterfaceProbe = findProbeInterfaceProbeByIdentifier(
      probeLibraryStore.library,
      value
    );
    if (!probeInterfaceProbe) return;

    setProbeInterface(
      currentExperimentStore.experiment,
      probe,
      probeInterfaceProbe
    );
  }
});

const probeIdentifiers = computed<string[]>(() =>
  probeLibraryStore.library.map(getProbeInterfaceIdentifier)
);

const name = computed({
  get: () => probe.name,
  set: (value: string) => (probe.name = value.trim())
});

const ap = computed({
  get: () => String(probe.tipPosition[0]),
  set: (value: string) => (probe.tipPosition[0] = Number(value))
});

const dv = computed({
  get: () => String(probe.tipPosition[1]),
  set: (value: string) => (probe.tipPosition[1] = Number(value))
});

const ml = computed({
  get: () => String(probe.tipPosition[2]),
  set: (value: string) => (probe.tipPosition[2] = Number(value))
});

const roll = computed({
  get: () => String(probe.rotation[0]),
  set: (value: string) => (probe.rotation[0] = Number(value))
});

const yaw = computed({
  get: () => String(probe.rotation[1]),
  set: (value: string) => (probe.rotation[1] = Number(value))
});

const pitch = computed({
  get: () => String(probe.rotation[2]),
  set: (value: string) => (probe.rotation[2] = Number(value))
});

const nameRules: ValidationRule<string>[] = [
  value => value.trim().length > 0 || t("probeInspector.nameRequired")
];

const numberRules: ValidationRule<string>[] = [
  value =>
    (value.trim().length > 0 && Number.isFinite(Number(value))) ||
    t("probeInspector.mustBeNumber")
];
</script>

<template>
  <div class="column q q-gutter-y-md">
    <CommittedInput
      v-model="name"
      :label="t('probeInspector.name')"
      outlined
      :rules="nameRules"
    />

    <q-select
      v-model="probeIdentifier"
      :label="t('probeInspector.probeType')"
      :options="probeIdentifiers"
      outlined
    />

    <br />

    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-model="ap"
        :label="t('probeInspector.ap')"
        :rules="numberRules"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="dv"
        :label="t('probeInspector.dv')"
        :rules="numberRules"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="ml"
        :label="t('probeInspector.ml')"
        :rules="numberRules"
        class="col"
        outlined
      />
    </div>

    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-model="roll"
        :label="t('probeInspector.roll')"
        :rules="numberRules"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="yaw"
        :label="t('probeInspector.yaw')"
        :rules="numberRules"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="pitch"
        :label="t('probeInspector.pitch')"
        :rules="numberRules"
        class="col"
        outlined
      />
    </div>

    <div>
      <q-color
        v-model="probe.color"
        :palette="STANDARD_COLORS"
        default-view="palette"
      />
    </div>
  </div>
</template>

<style lang="sass" scoped></style>
