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
});
