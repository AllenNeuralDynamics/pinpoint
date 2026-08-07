import { describe, expect, it } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import WorldPreferences from "./WorldPreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";
import { STANDARD_COLORS } from "@/features/scene";
import enUS from "@/i18n/en-US";

const t = enUS.preferences;

/** The toggle rendering a given label. */
function findToggle(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents({ name: "QToggle" })
    .find(toggle => toggle.props("label") === label)!;
}

describe("WorldPreferences", () => {
  it("picking a palette color writes it to worldBackgroundColor", async () => {
    const wrapper = mountWithQuasar(WorldPreferences);
    const preferences = usePreferencesStore();

    await wrapper
      .findComponent({ name: "QColor" })
      .vm.$emit("update:modelValue", "#123456");

    expect(preferences.worldBackgroundColor).toBe("#123456");
  });

  it("appends Babylon's default clear color to the standard palette", () => {
    const wrapper = mountWithQuasar(WorldPreferences);

    expect(wrapper.findComponent({ name: "QColor" }).props("palette")).toEqual([
      ...STANDARD_COLORS,
      "#33334d"
    ]);
  });

  it("the glossiness slider starts at 64", () => {
    const wrapper = mountWithQuasar(WorldPreferences);

    const sliders = wrapper.findAllComponents({ name: "QSlider" });
    const glossinessSlider = sliders.find(
      slider => slider.props("max") === 128
    )!;

    expect(glossinessSlider.props("modelValue")).toBe(64);
  });

  it("writes moved slider values to their preferences", async () => {
    const wrapper = mountWithQuasar(WorldPreferences);
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
    const wrapper = mountWithQuasar(WorldPreferences);

    expect(
      findToggle(wrapper, t.hideStructureInteriors).props("modelValue")
    ).toBe(true);
  });

  it("toggling off writes areStructureInteriorsHidden to false", async () => {
    const wrapper = mountWithQuasar(WorldPreferences);
    const preferences = usePreferencesStore();

    await findToggle(wrapper, t.hideStructureInteriors).vm.$emit(
      "update:modelValue",
      false
    );

    expect(preferences.areStructureInteriorsHidden).toBe(false);
  });

  it("the ambient-occlusion toggle starts at false", () => {
    const wrapper = mountWithQuasar(WorldPreferences);

    expect(findToggle(wrapper, t.ambientOcclusion).props("modelValue")).toBe(
      false
    );
  });

  it("toggling ambient occlusion on writes isSsaoEnabled to true", async () => {
    const wrapper = mountWithQuasar(WorldPreferences);
    const preferences = usePreferencesStore();

    await findToggle(wrapper, t.ambientOcclusion).vm.$emit(
      "update:modelValue",
      true
    );

    expect(preferences.isSsaoEnabled).toBe(true);
  });
});
