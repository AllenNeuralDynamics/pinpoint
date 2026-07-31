import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ProbeInspector from "./ProbeInspector.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { makeProbe, makeProbeInterfaceProbe } from "@/test/fixtures";
import { getManifest, getTerminologyRows } from "@/features/atlas";
import { internProbeInterfaceProbe } from "@/features/experiment";
import {
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier
} from "@/features/probe";
import enUS from "@/i18n/en-US";

const t = enUS.probeInspector;

// `useCurrentExperimentStore`'s `manifest`/`terminologyRows` are
// `computedAsync` and fetch on store creation -- mock the leaf module (not
// the `@/features/atlas` barrel) or mounting triggers real network calls.
// Mirrors the mocking approach in SceneHierarchy.spec.ts.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getManifest: vi.fn(),
    getTerminologyRows: vi.fn()
  };
});

function fieldByLabel(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents({ name: "QInput" })
    .find(field => field.props("label") === label)!;
}

/**
 * Focus, replace a field's text, and blur it -- the sequence a real user
 * produces, which `use-field`'s handlers require in this order.
 */
async function editAndBlur(field: VueWrapper, value: string) {
  const native = field.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("focusout");
  await new Promise(resolve => setTimeout(resolve));
}

async function editAndEnter(field: VueWrapper, value: string) {
  const native = field.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("keyup", { key: "Enter" });
}

describe("ProbeInspector", () => {
  beforeEach(() => {
    vi.mocked(getManifest).mockResolvedValue(null);
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  function mountInspector(probe = makeProbe()) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    probeLibrary.add(makeProbeInterfaceProbe());
    const store = useCurrentExperimentStore(pinia);
    store.experiment.probes = [probe];

    const wrapper = mountWithQuasar(ProbeInspector, {
      pinia,
      props: { probe: store.experiment.probes[0]! }
    });
    return { wrapper, store, probe: store.experiment.probes[0]! };
  }

  it("does not mutate the name while typing, before blur or enter", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    const name = fieldByLabel(wrapper, t.name);
    await name.find("input").trigger("focusin");
    await name.find("input").setValue("B");

    expect(probe.name).toBe("A");
  });

  it("commits the name on blur when valid", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    await editAndBlur(fieldByLabel(wrapper, t.name), "B");

    expect(probe.name).toBe("B");
  });

  it("commits the name on Enter when valid", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    await editAndEnter(fieldByLabel(wrapper, t.name), "B");

    expect(probe.name).toBe("B");
  });

  it("rejects a whitespace-only name and leaves the probe's name unchanged", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    const name = fieldByLabel(wrapper, t.name);
    await editAndBlur(name, "   ");

    expect(probe.name).toBe("A");
    expect(name.find("[role='alert']").text()).toBe(t.nameRequired);
  });

  it("accepts a name already used by another probe in the experiment", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useProbeLibraryStore(pinia).add(makeProbeInterfaceProbe());
    const store = useCurrentExperimentStore(pinia);
    store.experiment.probes = [
      makeProbe({ name: "A" }),
      makeProbe({ name: "B" })
    ];
    const wrapper = mountWithQuasar(ProbeInspector, {
      pinia,
      props: { probe: store.experiment.probes[0]! }
    });

    const name = fieldByLabel(wrapper, t.name);
    await editAndBlur(name, "B");

    expect(store.experiment.probes[0]!.name).toBe("B");
    expect(name.find("[role='alert']").exists()).toBe(false);
  });

  it("trims whitespace when committing a name", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    await editAndBlur(fieldByLabel(wrapper, t.name), "  Renamed  ");

    expect(probe.name).toBe("Renamed");
  });

  it("accepts re-committing the probe's own unchanged name", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    const name = fieldByLabel(wrapper, t.name);
    await editAndBlur(name, "A");

    expect(probe.name).toBe("A");
    expect(name.find("[role='alert']").exists()).toBe(false);
  });

  it("commits AP/DV/ML into tipPosition as real numbers", async () => {
    const { wrapper, probe } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, t.ap), "-2.5");
    await editAndBlur(fieldByLabel(wrapper, t.dv), "1");
    await editAndBlur(fieldByLabel(wrapper, t.ml), "0");

    expect(probe.tipPosition).toEqual([-2.5, 1, 0]);
    expect(probe.tipPosition.every(value => typeof value === "number")).toBe(
      true
    );
  });

  it("commits Roll/Yaw/Pitch into orientation as real numbers", async () => {
    const { wrapper, probe } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, t.roll), "0.1");
    await editAndBlur(fieldByLabel(wrapper, t.yaw), "0.2");
    await editAndBlur(fieldByLabel(wrapper, t.pitch), "0.3");

    expect(probe.rotation).toEqual([0.1, 0.2, 0.3]);
  });

  it("rejects a non-numeric value in a numeric field", async () => {
    const { wrapper, probe } = mountInspector();

    const ap = fieldByLabel(wrapper, t.ap);
    await editAndBlur(ap, "abc");

    expect(probe.tipPosition[0]).toBe(0);
    expect(ap.find("[role='alert']").text()).toBe(t.mustBeNumber);
  });

  it("rejects an empty numeric field", async () => {
    const { wrapper, probe } = mountInspector(
      makeProbe({ tipPosition: [5, 0, 0] })
    );

    await editAndBlur(fieldByLabel(wrapper, t.ap), "");

    expect(probe.tipPosition[0]).toBe(5);
  });

  it("accepts zero in a numeric field", async () => {
    const { wrapper, probe } = mountInspector(
      makeProbe({ tipPosition: [5, 0, 0] })
    );

    await editAndBlur(fieldByLabel(wrapper, t.ap), "0");

    expect(probe.tipPosition[0]).toBe(0);
  });

  it("re-seeds every field when the probe prop changes", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useProbeLibraryStore(pinia).add(makeProbeInterfaceProbe());
    const store = useCurrentExperimentStore(pinia);
    const a = makeProbe({ name: "A", tipPosition: [1, 2, 3] });
    const b = makeProbe({ name: "B", tipPosition: [4, 5, 6] });
    store.experiment.probes = [a, b];
    const wrapper = mountWithQuasar(ProbeInspector, {
      pinia,
      props: { probe: a }
    });

    // Cast: `setProps`'s generic doesn't narrow to the SFC's declared props.
    await wrapper.setProps({ probe: b } as Record<string, unknown>);

    expect(fieldByLabel(wrapper, t.name).props("modelValue")).toBe("B");
    expect(fieldByLabel(wrapper, t.ap).props("modelValue")).toBe("4");
  });

  it("keeps the renamed probe selected and in sync with the store", async () => {
    // Selection is tracked by id, so a rename must not affect it.
    const { wrapper, store, probe } = mountInspector(makeProbe({ name: "A" }));
    store.selectedInspectable = probe;

    await editAndBlur(fieldByLabel(wrapper, t.name), "B");

    expect(store.isInspectableSelected(probe)).toBe(true);
    expect(store.selectedInspectable?.name).toBe("B");
  });

  describe("probe type select", () => {
    it("shows the library probe's display name, not its raw identifier", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const spec = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "NP1000" }
      });
      useProbeLibraryStore(pinia).add(spec);
      const store = useCurrentExperimentStore(pinia);
      const probe = makeProbe({
        probeInterfaceIdentifier: getProbeInterfaceIdentifier(spec)
      });
      store.experiment.probes = [probe];
      internProbeInterfaceProbe(store.experiment, spec);
      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe }
      });

      const select = wrapper.findComponent({ name: "QSelect" });
      expect(select.props("options")).toEqual([
        {
          label: getProbeInterfaceDisplayName(spec),
          value: getProbeInterfaceIdentifier(spec)
        }
      ]);
      expect(select.text()).toContain(getProbeInterfaceDisplayName(spec));
    });

    it("falls back to the raw identifier without throwing when the probe's type isn't in the library", () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useCurrentExperimentStore(pinia);
      const probe = makeProbe({
        probeInterfaceIdentifier: "imec NP1000"
      });
      store.experiment.probes = [probe];

      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe }
      });

      expect(wrapper.findComponent({ name: "QSelect" }).text()).toContain(
        "imec NP1000"
      );
    });
  });

  describe("switching probe type", () => {
    it("interns the new definition, repoints the probe, and drops the old definition", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const oldSpec = makeProbeInterfaceProbe();
      const newSpec = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      });
      const probeLibrary = useProbeLibraryStore(pinia);
      probeLibrary.add(oldSpec);
      probeLibrary.add(newSpec);
      const store = useCurrentExperimentStore(pinia);
      const probe = makeProbe({
        probeInterfaceIdentifier: getProbeInterfaceIdentifier(oldSpec)
      });
      store.experiment.probes = [probe];
      internProbeInterfaceProbe(store.experiment, oldSpec);
      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe }
      });

      wrapper
        .findComponent({ name: "QSelect" })
        .vm.$emit("update:modelValue", getProbeInterfaceIdentifier(newSpec));
      await wrapper.vm.$nextTick();

      expect(probe.probeInterfaceIdentifier).toBe(
        getProbeInterfaceIdentifier(newSpec)
      );
      expect(store.experiment.probeInterfaceProbes).toEqual({
        [getProbeInterfaceIdentifier(newSpec)]: newSpec
      });
    });

    it("does nothing when the selected identifier isn't in the library", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const oldSpec = makeProbeInterfaceProbe();
      useProbeLibraryStore(pinia).add(oldSpec);
      const store = useCurrentExperimentStore(pinia);
      const probe = makeProbe({
        probeInterfaceIdentifier: getProbeInterfaceIdentifier(oldSpec)
      });
      store.experiment.probes = [probe];
      internProbeInterfaceProbe(store.experiment, oldSpec);
      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe }
      });

      wrapper
        .findComponent({ name: "QSelect" })
        .vm.$emit("update:modelValue", "unknown manufacturer unknown-model");
      await wrapper.vm.$nextTick();

      expect(probe.probeInterfaceIdentifier).toBe(
        getProbeInterfaceIdentifier(oldSpec)
      );
      expect(store.experiment.probeInterfaceProbes).toEqual({
        [getProbeInterfaceIdentifier(oldSpec)]: oldSpec
      });
    });
  });
});
