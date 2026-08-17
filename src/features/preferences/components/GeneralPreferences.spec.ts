import { describe, expect, it } from "vitest";
import GeneralPreferences from "./GeneralPreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";

describe("GeneralPreferences", () => {
  it("selecting Dark writes 'dark' to appearance", async () => {
    const wrapper = mountWithQuasar(GeneralPreferences);
    const preferences = usePreferencesStore();
    const themeToggle = wrapper.findAllComponents({ name: "QBtnToggle" })[0]!;

    await themeToggle.vm.$emit("update:modelValue", "dark");

    expect(preferences.appearance).toBe("dark");
  });

  it("offers light, dark and auto themes with auto selected by default", () => {
    const wrapper = mountWithQuasar(GeneralPreferences);
    const themeToggle = wrapper.findAllComponents({ name: "QBtnToggle" })[0]!;

    expect(themeToggle.props("options")).toEqual([
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
      { label: "Auto", value: "auto" }
    ]);
    expect(themeToggle.props("modelValue")).toBe("auto");
  });

  it("renders the unit preferences", () => {
    const wrapper = mountWithQuasar(GeneralPreferences);

    expect(wrapper.findComponent({ name: "UnitPreferences" }).exists()).toBe(
      true
    );
  });

  it("the skip-splash toggle starts at false", () => {
    const wrapper = mountWithQuasar(GeneralPreferences);

    expect(wrapper.findComponent({ name: "QToggle" }).props("modelValue")).toBe(
      false
    );
  });

  it("toggling skip splash on writes isSplashScreenSkipped to true", async () => {
    const wrapper = mountWithQuasar(GeneralPreferences);
    const preferences = usePreferencesStore();

    await wrapper
      .findComponent({ name: "QToggle" })
      .vm.$emit("update:modelValue", true);

    expect(preferences.isSplashScreenSkipped).toBe(true);
  });

  it("the drag-sensitivity slider starts at 1 and writes what it is moved to", async () => {
    const wrapper = mountWithQuasar(GeneralPreferences);
    const preferences = usePreferencesStore();
    const slider = wrapper.findComponent({ name: "QSlider" });
    expect(slider.props("modelValue")).toBe(1);

    await slider.vm.$emit("update:modelValue", 2);

    expect(preferences.dragSensitivity).toBe(2);
  });
});
