import { describe, expect, it } from "vitest";
import AtlasPreferences from "./AtlasPreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";
import enUS from "@/i18n/en-US";

const t = enUS.preferences;

describe("AtlasPreferences", () => {
  it("the structure-transparency slider starts at 0.2", () => {
    const wrapper = mountWithQuasar(AtlasPreferences);

    expect(wrapper.findComponent({ name: "QSlider" }).props("modelValue")).toBe(
      0.2
    );
  });

  it("writes a moved structure-transparency slider to structureFadedAlpha", async () => {
    const wrapper = mountWithQuasar(AtlasPreferences);
    const preferences = usePreferencesStore();

    await wrapper
      .findComponent({ name: "QSlider" })
      .vm.$emit("update:modelValue", 0.5);

    expect(preferences.structureFadedAlpha).toBe(0.5);
  });

  it("the hide-interiors toggle starts at false", () => {
    const wrapper = mountWithQuasar(AtlasPreferences);

    const toggle = wrapper.findComponent({ name: "QToggle" });

    expect(toggle.props("label")).toBe(t.hideStructureInteriors);
    expect(toggle.props("modelValue")).toBe(false);
  });

  it("toggling hide-interiors on writes areStructureInteriorsHidden to true", async () => {
    const wrapper = mountWithQuasar(AtlasPreferences);
    const preferences = usePreferencesStore();

    await wrapper
      .findComponent({ name: "QToggle" })
      .vm.$emit("update:modelValue", true);

    expect(preferences.areStructureInteriorsHidden).toBe(true);
  });
});
