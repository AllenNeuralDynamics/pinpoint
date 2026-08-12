import { describe, expect, it } from "vitest";
import ProbePreferences from "./ProbePreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";
import enUS from "@/i18n/en-US";

const t = enUS.preferences;

/**
 * Locate a `q-input` in `ProbePreferences` by its label.
 * @param wrapper Mounted `ProbePreferences` wrapper.
 * @param label Field label to search for.
 */
function fieldByLabel(
  wrapper: ReturnType<typeof mountWithQuasar>,
  label: string
) {
  return wrapper
    .findAllComponents({ name: "QInput" })
    .find(field => field.props("label") === label)!;
}

describe("ProbePreferences", () => {
  it("typing 50 into Rod Length writes 50 to probeRodLengthMillimeters", async () => {
    const wrapper = mountWithQuasar(ProbePreferences);
    const preferences = usePreferencesStore();

    await fieldByLabel(wrapper, t.rodLength).vm.$emit(
      "update:modelValue",
      "50"
    );

    expect(preferences.probeRodLengthMillimeters).toBe(50);
  });

  it("typing 0 into Shank Thickness clamps to the 0.001 minimum", async () => {
    const wrapper = mountWithQuasar(ProbePreferences);
    const preferences = usePreferencesStore();

    await fieldByLabel(wrapper, t.shankThickness).vm.$emit(
      "update:modelValue",
      "0"
    );

    expect(preferences.probeShankThicknessMillimeters).toBe(0.001);
  });

  it("clamps a negative value to a non-negative minimum for every geometry field", async () => {
    const wrapper = mountWithQuasar(ProbePreferences);
    const preferences = usePreferencesStore();
    const fields: Array<
      [string, keyof ReturnType<typeof usePreferencesStore>]
    > = [
      [t.shankThickness, "probeShankThicknessMillimeters"],
      [t.headStageLength, "probeHeadStageLengthMillimeters"],
      [t.headStageCutDepth, "probeHeadStageCutDepthMillimeters"],
      [t.rodDiameter, "probeRodDiameterMillimeters"],
      [t.rodLength, "probeRodLengthMillimeters"]
    ];

    for (const [label, key] of fields) {
      await fieldByLabel(wrapper, label).vm.$emit("update:modelValue", "-5");

      expect(preferences[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it("displays every geometry field in the preferences store's position unit", async () => {
    const wrapper = mountWithQuasar(ProbePreferences);
    const preferences = usePreferencesStore();
    preferences.probeShankThicknessMillimeters = 1;
    preferences.positionUnit = "micrometer";
    await wrapper.vm.$nextTick();

    const shankThickness = fieldByLabel(wrapper, t.shankThickness);
    expect(shankThickness.props("modelValue")).toBe(1000);
    expect(shankThickness.props("suffix")).toBe("µm");
  });

  it("writes a value entered in the display unit back in millimeters", async () => {
    const wrapper = mountWithQuasar(ProbePreferences);
    const preferences = usePreferencesStore();
    preferences.positionUnit = "micrometer";
    await wrapper.vm.$nextTick();

    await fieldByLabel(wrapper, t.rodLength).vm.$emit(
      "update:modelValue",
      "500"
    );

    expect(preferences.probeRodLengthMillimeters).toBe(0.5);
  });

  it("dragging Rod Length 100 px right raises probeRodLengthMillimeters by 1", async () => {
    const wrapper = mountWithQuasar(ProbePreferences);
    const preferences = usePreferencesStore();
    await wrapper.vm.$nextTick();
    const field = fieldByLabel(wrapper, t.rodLength);

    await field.trigger("pointerdown", { clientX: 0, pointerId: 1, button: 0 });
    await field.trigger("pointermove", { clientX: 100, pointerId: 1 });

    expect(preferences.probeRodLengthMillimeters).toBe(201);
  });

  it("scales the same 100 px drag by the drag-sensitivity preference", async () => {
    const wrapper = mountWithQuasar(ProbePreferences);
    const preferences = usePreferencesStore();
    preferences.dragSensitivity = 2;
    await wrapper.vm.$nextTick();
    const field = fieldByLabel(wrapper, t.rodLength);

    await field.trigger("pointerdown", { clientX: 0, pointerId: 1, button: 0 });
    await field.trigger("pointermove", { clientX: 100, pointerId: 1 });

    expect(preferences.probeRodLengthMillimeters).toBe(202);
  });

  it("clamps a far-left drag on Shank Thickness to its 0.001 minimum", async () => {
    const wrapper = mountWithQuasar(ProbePreferences);
    const preferences = usePreferencesStore();
    await wrapper.vm.$nextTick();
    const field = fieldByLabel(wrapper, t.shankThickness);

    await field.trigger("pointerdown", { clientX: 0, pointerId: 1, button: 0 });
    await field.trigger("pointermove", { clientX: -10_000, pointerId: 1 });

    expect(preferences.probeShankThicknessMillimeters).toBe(0.001);
  });
});
