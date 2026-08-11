import { describe, expect, it } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import AtlasAxisInputs from "./AtlasAxisInputs.vue";
import { flushMicrotasks, mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";

/**
 * Focus, replace a field's text, and blur it -- the sequence a real user
 * produces, which `CommittedInput` requires in this order.
 */
async function editAndBlur(field: VueWrapper, value: string) {
  const native = field.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("focusout");
  await flushMicrotasks();
}

/** Every rendered `QInput`, in DOM order. */
function fields(wrapper: VueWrapper) {
  return wrapper.findAllComponents({ name: "QInput" });
}

describe("AtlasAxisInputs", () => {
  it("renders the position triple in AP, DV, ML order by default", () => {
    const wrapper = mountWithQuasar(AtlasAxisInputs, {
      props: { tuple: [1, 2, 3], kind: "position" }
    });

    expect(fields(wrapper).map(field => field.props("label"))).toEqual([
      "AP",
      "DV",
      "ML"
    ]);
    expect(fields(wrapper).map(field => field.props("modelValue"))).toEqual([
      "1.000",
      "2.000",
      "3.000"
    ]);
  });

  it("renders the rotation triple in Roll, Yaw, Pitch order by default", () => {
    const wrapper = mountWithQuasar(AtlasAxisInputs, {
      props: { tuple: [1, 2, 3], kind: "rotation" }
    });

    expect(fields(wrapper).map(field => field.props("label"))).toEqual([
      "Roll",
      "Yaw",
      "Pitch"
    ]);
  });

  it("reorders and relabels fields to match the preference store, without transposing values", async () => {
    const wrapper = mountWithQuasar(AtlasAxisInputs, {
      props: { tuple: [1, 2, 3], kind: "position" }
    });
    const preferences = usePreferencesStore();

    preferences.positionAxisNames = ["Bregma AP", "", ""];
    preferences.positionAxisOrder = [2, 1, 0];
    await wrapper.vm.$nextTick();

    expect(fields(wrapper).map(field => field.props("label"))).toEqual([
      "ML",
      "DV",
      "Bregma AP"
    ]);
    expect(fields(wrapper)[2]!.props("modelValue")).toBe("1.000");
  });

  it("writes an edit on the renamed, reordered field back to its own axis", async () => {
    const tuple: [number, number, number] = [1, 2, 3];
    const wrapper = mountWithQuasar(AtlasAxisInputs, {
      props: { tuple, kind: "position" }
    });
    const preferences = usePreferencesStore();
    preferences.positionAxisNames = ["Bregma AP", "", ""];
    preferences.positionAxisOrder = [2, 1, 0];
    await wrapper.vm.$nextTick();

    await editAndBlur(fields(wrapper)[2]!, "9");

    expect(tuple[0]).toBe(9);
    expect(tuple[2]).toBe(3);
  });

  it("converts values into the active position unit", async () => {
    const wrapper = mountWithQuasar(AtlasAxisInputs, {
      props: { tuple: [10, 0, 0], kind: "position" }
    });
    const preferences = usePreferencesStore();

    preferences.positionUnit = "centimeter";
    await wrapper.vm.$nextTick();

    expect(fields(wrapper)[0]!.props("modelValue")).toBe("1.000");
  });

  it("forwards attributes onto every rendered input", () => {
    const wrapper = mountWithQuasar(AtlasAxisInputs, {
      props: { tuple: [1, 2, 3], kind: "position" },
      attrs: { disable: true, outlined: true }
    });

    for (const field of fields(wrapper)) {
      expect(field.props("disable")).toBe(true);
      expect(field.props("outlined")).toBe(true);
    }
  });

  it("subtracts an offset tuple from each displayed value", () => {
    const wrapper = mountWithQuasar(AtlasAxisInputs, {
      props: { tuple: [1, 2, 3], kind: "position", offset: [10, 20, 30] }
    });

    expect(fields(wrapper).map(field => field.props("modelValue"))).toEqual([
      "-9.000",
      "-18.000",
      "-27.000"
    ]);
  });

  it("adds the offset back on write, leaving the tuple absolute", async () => {
    const tuple: [number, number, number] = [1, 2, 3];
    const wrapper = mountWithQuasar(AtlasAxisInputs, {
      props: { tuple, kind: "position", offset: [10, 20, 30] }
    });

    await editAndBlur(fields(wrapper)[0]!, "5");

    expect(tuple[0]).toBeCloseTo(15, 6);
  });
});
