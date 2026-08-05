import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import Inspector from "./Inspector.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { makeProbe } from "@/test/fixtures";
import { getTerminologyRows } from "@/features/atlas";
import { CAMERA_INSPECTABLE } from "@/features/scene";
import enUS from "@/i18n/en-US";

const t = enUS.inspector;

// `useCurrentExperimentStore`'s `manifest`/`terminologyRows` are
// `computedAsync` and fetch on store creation -- mock the leaf module (not
// the `@/features/atlas` barrel) or mounting triggers real network calls.
// Mirrors the mocking approach in ProbeInspector.spec.ts.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

function mountInspector() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useCurrentExperimentStore(pinia);

  const wrapper = mountWithQuasar(Inspector, {
    pinia,
    global: { stubs: { ProbeInspector: true, CameraInspector: true } }
  });
  return { wrapper, store };
}

describe("Inspector", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("shows the empty hint and no ProbeInspector when nothing is selected", () => {
    const { wrapper } = mountInspector();

    expect(wrapper.text()).toContain(t.emptyHint);
    expect(wrapper.findComponent({ name: "ProbeInspector" }).exists()).toBe(
      false
    );
  });

  it("renders a ProbeInspector for the selected probe and hides the hint", async () => {
    const { wrapper, store } = mountInspector();
    const probe = makeProbe();
    store.selectedInspectable = probe;
    await wrapper.vm.$nextTick();

    expect(
      wrapper.findComponent({ name: "ProbeInspector" }).props("probe")
    ).toEqual(probe);
    expect(wrapper.text()).not.toContain(t.emptyHint);
  });

  it("swaps from the hint to ProbeInspector when a probe is selected after mount", async () => {
    const { wrapper, store } = mountInspector();
    expect(wrapper.findComponent({ name: "ProbeInspector" }).exists()).toBe(
      false
    );

    store.selectedInspectable = makeProbe();
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "ProbeInspector" }).exists()).toBe(
      true
    );
    expect(wrapper.text()).not.toContain(t.emptyHint);
  });

  it("swaps back to the hint when the selection is cleared", async () => {
    const { wrapper, store } = mountInspector();
    store.selectedInspectable = makeProbe();
    await wrapper.vm.$nextTick();

    store.selectedInspectable = null;
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "ProbeInspector" }).exists()).toBe(
      false
    );
    expect(wrapper.text()).toContain(t.emptyHint);
  });

  it("renders a CameraInspector for the camera selection and hides the hint", async () => {
    const { wrapper, store } = mountInspector();
    store.selectedInspectable = CAMERA_INSPECTABLE;
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "CameraInspector" }).exists()).toBe(
      true
    );
    expect(wrapper.text()).not.toContain(t.emptyHint);
  });
});
