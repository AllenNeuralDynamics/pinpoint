import { describe, expect, it } from "vitest";
import CameraPreferences from "./CameraPreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";

describe("CameraPreferences", () => {
  it("renders exactly the projection toggle and the inertia slider", () => {
    const wrapper = mountWithQuasar(CameraPreferences);

    expect(wrapper.findAllComponents({ name: "QBtnToggle" })).toHaveLength(1);
    expect(wrapper.findAllComponents({ name: "QSlider" })).toHaveLength(1);
  });

  it("selecting Orthographic writes 'orthographic' to the preferences store", async () => {
    const wrapper = mountWithQuasar(CameraPreferences);
    const preferences = usePreferencesStore();

    await wrapper
      .findComponent({ name: "QBtnToggle" })
      .vm.$emit("update:modelValue", "orthographic");

    expect(preferences.cameraProjection).toBe("orthographic");
  });

  it("the inertia slider starts at 0.9 and writes what it is moved to", async () => {
    const wrapper = mountWithQuasar(CameraPreferences);
    const preferences = usePreferencesStore();
    const slider = wrapper.findComponent({ name: "QSlider" });
    expect(slider.props("modelValue")).toBe(0.9);

    await slider.vm.$emit("update:modelValue", 0.2);

    expect(preferences.cameraInertia).toBe(0.2);
  });
});
