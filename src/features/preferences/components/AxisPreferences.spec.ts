import { describe, expect, it } from "vitest";
import AxisPreferences from "./AxisPreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";

describe("AxisPreferences", () => {
  it("renders one AxisNameList for position and one for rotation", () => {
    const wrapper = mountWithQuasar(AxisPreferences);

    const lists = wrapper.findAllComponents({ name: "AxisNameList" });
    expect(lists).toHaveLength(2);
    expect(lists[0]!.props("defaultNames")).toEqual(["AP", "DV", "ML"]);
    expect(lists[1]!.props("defaultNames")).toEqual(["Roll", "Yaw", "Pitch"]);
  });

  it("binds each list to its own store fields", () => {
    const wrapper = mountWithQuasar(AxisPreferences);
    const preferences = usePreferencesStore();

    const lists = wrapper.findAllComponents({ name: "AxisNameList" });
    expect(lists[0]!.props("names")).toBe(preferences.positionAxisNames);
    expect(lists[0]!.props("order")).toBe(preferences.positionAxisOrder);
    expect(lists[1]!.props("names")).toBe(preferences.rotationAxisNames);
    expect(lists[1]!.props("order")).toBe(preferences.rotationAxisOrder);
  });
});
