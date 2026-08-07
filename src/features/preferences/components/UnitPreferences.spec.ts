import { describe, expect, it } from "vitest";
import UnitPreferences from "./UnitPreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";

describe("UnitPreferences", () => {
  it("selecting µm writes 'micrometer' to positionUnit", async () => {
    const wrapper = mountWithQuasar(UnitPreferences);
    const preferences = usePreferencesStore();
    const toggles = wrapper.findAllComponents({ name: "QBtnToggle" });
    const positionToggle = toggles[0]!;

    await positionToggle.vm.$emit("update:modelValue", "micrometer");

    expect(preferences.positionUnit).toBe("micrometer");
  });

  it("selecting rad writes 'radian' to rotationUnit", async () => {
    const wrapper = mountWithQuasar(UnitPreferences);
    const preferences = usePreferencesStore();
    const toggles = wrapper.findAllComponents({ name: "QBtnToggle" });
    const rotationToggle = toggles[1]!;

    await rotationToggle.vm.$emit("update:modelValue", "radian");

    expect(preferences.rotationUnit).toBe("radian");
  });

  it("typing 1 into Decimal Places writes 1", async () => {
    const wrapper = mountWithQuasar(UnitPreferences);
    const preferences = usePreferencesStore();
    const decimalPlacesInput = wrapper.findComponent({ name: "QInput" });

    await decimalPlacesInput.vm.$emit("update:modelValue", "1");

    expect(preferences.decimalPrecision).toBe(1);
  });

  it("clearing the decimal places field leaves it unchanged", async () => {
    const wrapper = mountWithQuasar(UnitPreferences);
    const preferences = usePreferencesStore();
    const decimalPlacesInput = wrapper.findComponent({ name: "QInput" });

    await decimalPlacesInput.vm.$emit("update:modelValue", "");

    expect(preferences.decimalPrecision).toBe(3);
  });

  it("orders the position toggle µm, mm, cm with lowercase labels and no inches", () => {
    const wrapper = mountWithQuasar(UnitPreferences);
    const toggles = wrapper.findAllComponents({ name: "QBtnToggle" });
    const positionToggle = toggles[0]!;

    expect(positionToggle.props("options")).toEqual([
      { label: "µm", value: "micrometer" },
      { label: "mm", value: "millimeter" },
      { label: "cm", value: "centimeter" }
    ]);
    expect(positionToggle.props("noCaps")).toBe(true);
  });
});
