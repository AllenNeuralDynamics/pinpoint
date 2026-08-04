<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  copyProbe,
  findProbeInterfaceProbeByIdentifier,
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier,
  homeProbe,
  type Probe,
  toggleProbeLock
} from "@/features/probe";
import { STANDARD_COLORS } from "@/features/scene";
import { SliceCanvas } from "@/features/slice";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { setProbeInterface } from "@/features/experiment";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useNumericTupleModel } from "@/composable/useNumericTupleModel";
import { useValidationRules } from "@/composable/useValidationRules";
import CommittedInput from "@/components/CommittedInput.vue";

// A library probe's identifier paired with its display label. `emit-value`
// keeps the model the identifier, which `findProbeInterfaceProbeByIdentifier`
// needs.
interface ProbeTypeOption {
  label: string;
  value: string;
}

const { probe } = defineProps<{
  probe: Probe;
}>();

const probeLibraryStore = useProbeLibraryStore();
const currentExperimentStore = useCurrentExperimentStore();
const { requiredName: nameRules, optionalNumber: numberRules } =
  useValidationRules();

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

const probeTypeOptions = computed<ProbeTypeOption[]>(() =>
  probeLibraryStore.library.map(probeInterfaceProbe => ({
    label: getProbeInterfaceDisplayName(probeInterfaceProbe),
    value: getProbeInterfaceIdentifier(probeInterfaceProbe)
  }))
);

const name = computed({
  get: () => probe.name,
  set: (value: string) => (probe.name = value.trim())
});

const ap = useNumericTupleModel(() => probe.tipPosition, 0);
const dv = useNumericTupleModel(() => probe.tipPosition, 1);
const ml = useNumericTupleModel(() => probe.tipPosition, 2);

const roll = useNumericTupleModel(() => probe.rotation, 0);
const yaw = useNumericTupleModel(() => probe.rotation, 1);
const pitch = useNumericTupleModel(() => probe.rotation, 2);

const lockIcon = computed(() =>
  probe.lock ? "lock" : "sym_o_lock_open_right"
);

const lockColor = computed(() => (probe.lock ? "accent" : ""));

const lockLabel = computed(() =>
  probe.lock ? t("probeInspector.unlock") : t("probeInspector.lock")
);
</script>

<template>
  <div class="column q-gutter-y-md probe-inspector">
    <SliceCanvas :probe="probe" />

    <q-btn-group spread>
      <q-btn
        :aria-label="t('probeInspector.home')"
        :disable="probe.lock"
        icon="home"
        @click="homeProbe(probe)"
      />
      <q-btn
        :aria-label="t('probeInspector.copy')"
        icon="content_copy"
        @click="copyProbe(currentExperimentStore.experiment, probe)"
      />
      <q-btn
        :aria-label="lockLabel"
        :icon="lockIcon"
        @click="toggleProbeLock(probe)"
        :color="lockColor"
      />
    </q-btn-group>

    <CommittedInput
      v-model="name"
      :label="t('probeInspector.name')"
      outlined
      :rules="nameRules"
    />

    <q-select
      v-model="probeIdentifier"
      emit-value
      :label="t('probeInspector.probeType')"
      map-options
      :options="probeTypeOptions"
      outlined
    />

    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-model="ap"
        :disable="probe.lock"
        :label="t('axis.ap')"
        :rules="numberRules"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="dv"
        :disable="probe.lock"
        :label="t('axis.dv')"
        :rules="numberRules"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="ml"
        :disable="probe.lock"
        :label="t('axis.ml')"
        :rules="numberRules"
        class="col"
        outlined
      />
    </div>

    <div class="row q-gutter-x-sm">
      <CommittedInput
        v-model="roll"
        :disable="probe.lock"
        :label="t('probeInspector.roll')"
        :rules="numberRules"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="yaw"
        :disable="probe.lock"
        :label="t('probeInspector.yaw')"
        :rules="numberRules"
        class="col"
        outlined
      />
      <CommittedInput
        v-model="pitch"
        :disable="probe.lock"
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

<style lang="sass" scoped>
// Without this, the long probe-type label's intrinsic content width forces
// this flex item to grow past its drawer's width instead of wrapping/eliding.
.probe-inspector
  width: 100%

  :deep(.q-select)
    width: 100%
    min-width: 0

  :deep(.q-field__native > span)
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap
</style>
