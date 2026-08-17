import { beforeEach, describe, expect, it, vi } from "vitest";
import { toRaw } from "vue";
import RetainCoordinateSystems from "./RetainCoordinateSystems.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { getTerminologyRows } from "@/features/atlas";
import { buildDefaultGlobalCoordinateSystem } from "@/utils/coordinate-frame";
import enUS from "@/i18n/en-US";

// `useCurrentExperimentStore`'s `terminologyRows` is a `computedAsync` and
// fetches on store creation -- mock the leaf module (not the
// `@/features/atlas` barrel) or mounting triggers real network calls.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

describe("RetainCoordinateSystems", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("starts off, labelled and explained", () => {
    const wrapper = mountWithQuasar(RetainCoordinateSystems);

    const toggle = wrapper.findComponent({ name: "QToggle" });
    expect(toggle.props("modelValue")).toBe(false);
    expect(toggle.props("label")).toBe(
      enUS.preferences.retainCoordinateSystems
    );
    expect(wrapper.text()).toContain(
      enUS.preferences.retainCoordinateSystemsHint
    );
  });

  it("copies the scene's systems into the new-scene defaults when switched on", async () => {
    const wrapper = mountWithQuasar(RetainCoordinateSystems);
    const preferences = usePreferencesStore();
    const currentExperiment = useCurrentExperimentStore();
    const system = buildDefaultGlobalCoordinateSystem();
    system.axes[0].direction = "Right_to_left";
    system.axes[0].positionName = "Interaural ML";
    system.positionDisplayOrder = [2, 1, 0];
    currentExperiment.setGlobalCoordinateSystem(system);
    currentExperiment.setLocalCoordinateSystem({
      depthDirection: "Superior_to_inferior",
      forwardDirection: "Left_to_right"
    });

    await wrapper
      .findComponent({ name: "QToggle" })
      .vm.$emit("update:modelValue", true);

    expect(preferences.areCoordinateSystemsRetained).toBe(true);
    expect(preferences.newSceneGlobalCoordinateSystem).toEqual(
      currentExperiment.globalCoordinateSystem
    );
    expect(preferences.newSceneLocalCoordinateSystem).toEqual({
      depthDirection: "Superior_to_inferior",
      forwardDirection: "Left_to_right"
    });
  });

  it("retains a deep copy, never the experiment's own system", async () => {
    const wrapper = mountWithQuasar(RetainCoordinateSystems);
    const preferences = usePreferencesStore();
    const currentExperiment = useCurrentExperimentStore();

    await wrapper
      .findComponent({ name: "QToggle" })
      .vm.$emit("update:modelValue", true);

    const retained = toRaw(preferences.newSceneGlobalCoordinateSystem);
    const scene = toRaw(currentExperiment.globalCoordinateSystem);
    expect(retained).not.toBe(scene);
    expect(toRaw(retained.axes[0])).not.toBe(toRaw(scene.axes[0]));
  });

  it("leaves the retained systems behind when switched off", async () => {
    const wrapper = mountWithQuasar(RetainCoordinateSystems);
    const preferences = usePreferencesStore();
    const toggle = wrapper.findComponent({ name: "QToggle" });
    await toggle.vm.$emit("update:modelValue", true);
    const retained = preferences.newSceneGlobalCoordinateSystem;

    await toggle.vm.$emit("update:modelValue", false);

    expect(preferences.areCoordinateSystemsRetained).toBe(false);
    expect(preferences.newSceneGlobalCoordinateSystem).toBe(retained);
  });
});
