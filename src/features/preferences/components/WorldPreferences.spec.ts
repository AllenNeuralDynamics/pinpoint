import { describe, expect, it } from "vitest";
import WorldPreferences from "./WorldPreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";

describe("WorldPreferences", () => {
  it("picking a palette color writes it to worldBackgroundColor", async () => {
    const wrapper = mountWithQuasar(WorldPreferences);
    const preferences = usePreferencesStore();

    await wrapper
      .findComponent({ name: "QColor" })
      .vm.$emit("update:modelValue", "#123456");

    expect(preferences.worldBackgroundColor).toBe("#123456");
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
});
