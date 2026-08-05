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
});
