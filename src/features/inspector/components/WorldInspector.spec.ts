import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import WorldInspector from "./WorldInspector.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { STANDARD_COLORS } from "@/features/scene";
import { getTerminologyRows } from "@/features/atlas";
import enUS from "@/i18n/en-US";

const t = enUS.worldInspector;

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

/** The toggle rendering a given label. */
function findToggle(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents({ name: "QToggle" })
    .find(toggle => toggle.props("label") === label)!;
}

describe("WorldInspector", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("picking the light-mode picker's color writes it to worldBackgroundColorLightMode", async () => {
    const wrapper = mountWithQuasar(WorldInspector);
    const preferences = usePreferencesStore();

    await wrapper
      .findAllComponents({ name: "QColor" })[0]!
      .vm.$emit("update:modelValue", "#123456");

    expect(preferences.worldBackgroundColorLightMode).toBe("#123456");
    expect(preferences.worldBackgroundColorDarkMode).toBe("#33334d");
  });

  it("picking the dark-mode picker's color writes it to worldBackgroundColorDarkMode", async () => {
    const wrapper = mountWithQuasar(WorldInspector);
    const preferences = usePreferencesStore();

    await wrapper
      .findAllComponents({ name: "QColor" })[1]!
      .vm.$emit("update:modelValue", "#654321");

    expect(preferences.worldBackgroundColorDarkMode).toBe("#654321");
    expect(preferences.worldBackgroundColorLightMode).toBe("#33334d");
  });

  it("appends Babylon's default clear color and pure white to the standard palette for both pickers", () => {
    const wrapper = mountWithQuasar(WorldInspector);

    for (const picker of wrapper.findAllComponents({ name: "QColor" })) {
      expect(picker.props("palette")).toEqual([
        ...STANDARD_COLORS,
        "#33334d",
        "#ffffff"
      ]);
    }
  });

  it("the glossiness slider starts at 64", () => {
    const wrapper = mountWithQuasar(WorldInspector);

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const glossinessSlider = sliders.find(
      slider => slider.props("max") === 128
    )!;

    expect(glossinessSlider.props("modelValue")).toBe(64);
  });

  it("writes moved slider values to their preferences", async () => {
    const wrapper = mountWithQuasar(WorldInspector);
    const preferences = usePreferencesStore();
    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const lightSlider = sliders.find(slider => slider.props("max") === 2)!;
    const specularSlider = sliders.find(slider => slider.props("max") === 1)!;

    await lightSlider.vm.$emit("update:modelValue", 0);
    await specularSlider.vm.$emit("update:modelValue", 0);

    expect(preferences.worldLightIntensity).toBe(0);
    expect(preferences.materialSpecularIntensity).toBe(0);
  });

  it("the hide-interiors toggle starts at true", () => {
    const wrapper = mountWithQuasar(WorldInspector);

    expect(
      findToggle(wrapper, t.hideStructureInteriors).props("modelValue")
    ).toBe(true);
  });

  it("toggling off writes areStructureInteriorsHidden to false", async () => {
    const wrapper = mountWithQuasar(WorldInspector);
    const preferences = usePreferencesStore();

    await findToggle(wrapper, t.hideStructureInteriors).vm.$emit(
      "update:modelValue",
      false
    );

    expect(preferences.areStructureInteriorsHidden).toBe(false);
  });

  it("the ambient-occlusion toggle starts at false", () => {
    const wrapper = mountWithQuasar(WorldInspector);

    expect(findToggle(wrapper, t.ambientOcclusion).props("modelValue")).toBe(
      false
    );
  });

  it("toggling ambient occlusion on writes isSsaoEnabled to true", async () => {
    const wrapper = mountWithQuasar(WorldInspector);
    const preferences = usePreferencesStore();

    await findToggle(wrapper, t.ambientOcclusion).vm.$emit(
      "update:modelValue",
      true
    );

    expect(preferences.isSsaoEnabled).toBe(true);
  });

  it("clicking Back to Preferences deselects the world and reopens preferences on the scene tab", async () => {
    const wrapper = mountWithQuasar(WorldInspector);
    const currentExperiment = useCurrentExperimentStore();
    currentExperiment.selectedInspectable = { inspectableKind: "world" };
    const dialogSpy = vi.spyOn(wrapper.vm.$q, "dialog");

    await wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === t.backToPreferences)!
      .trigger("click");

    expect(currentExperiment.selectedInspectable).toBeNull();
    expect(dialogSpy).toHaveBeenCalledWith(
      expect.objectContaining({ componentProps: { tab: "scene" } })
    );
  });
});
