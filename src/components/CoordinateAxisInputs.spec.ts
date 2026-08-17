import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import CoordinateAxisInputs from "./CoordinateAxisInputs.vue";
import { flushMicrotasks, mountWithQuasar } from "@/test/mount-helper";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getTerminologyRows } from "@/features/atlas";

// The axis labels come from the current experiment store's coordinate system,
// whose terminology rows would otherwise be fetched from the atlas source.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

beforeEach(() => {
  vi.mocked(getTerminologyRows).mockResolvedValue([]);
});

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

describe("CoordinateAxisInputs", () => {
  it("renders the position triple in the coordinate system's axis order", () => {
    const wrapper = mountWithQuasar(CoordinateAxisInputs, {
      props: { tuple: [1, 2, 3], kind: "position" }
    });

    expect(fields(wrapper).map(field => field.props("label"))).toEqual([
      "ML",
      "AP",
      "SI"
    ]);
    expect(fields(wrapper).map(field => field.props("modelValue"))).toEqual([
      "1.000",
      "2.000",
      "3.000"
    ]);
  });

  it("renders the rotation triple labelled by the axis each turn is about", () => {
    const wrapper = mountWithQuasar(CoordinateAxisInputs, {
      props: { tuple: [1, 2, 3], kind: "rotation" }
    });

    expect(fields(wrapper).map(field => field.props("label"))).toEqual([
      "Pitch",
      "Roll",
      "Yaw"
    ]);
  });

  it("reorders and relabels fields to match the coordinate system, without transposing values", async () => {
    const wrapper = mountWithQuasar(CoordinateAxisInputs, {
      props: { tuple: [1, 2, 3], kind: "position" }
    });
    const system = useCurrentExperimentStore().globalCoordinateSystem;

    system.axes[0].positionName = "Bregma ML";
    system.positionDisplayOrder = [2, 1, 0];
    await wrapper.vm.$nextTick();

    expect(fields(wrapper).map(field => field.props("label"))).toEqual([
      "SI",
      "AP",
      "Bregma ML"
    ]);
    expect(fields(wrapper)[2]!.props("modelValue")).toBe("1.000");
  });

  it("writes an edit on the renamed, reordered field back to its own axis", async () => {
    const tuple: [number, number, number] = [1, 2, 3];
    const wrapper = mountWithQuasar(CoordinateAxisInputs, {
      props: { tuple, kind: "position" }
    });
    const system = useCurrentExperimentStore().globalCoordinateSystem;
    system.axes[0].positionName = "Bregma ML";
    system.positionDisplayOrder = [2, 1, 0];
    await wrapper.vm.$nextTick();

    await editAndBlur(fields(wrapper)[2]!, "9");

    expect(tuple[0]).toBe(9);
    expect(tuple[2]).toBe(3);
  });

  it("converts values into the active position unit", async () => {
    const wrapper = mountWithQuasar(CoordinateAxisInputs, {
      props: { tuple: [10, 0, 0], kind: "position" }
    });
    const preferences = usePreferencesStore();

    preferences.positionUnit = "centimeter";
    await wrapper.vm.$nextTick();

    expect(fields(wrapper)[0]!.props("modelValue")).toBe("1.000");
  });

  it("forwards attributes onto every rendered input", () => {
    const wrapper = mountWithQuasar(CoordinateAxisInputs, {
      props: { tuple: [1, 2, 3], kind: "position" },
      attrs: { disable: true, outlined: true }
    });

    for (const field of fields(wrapper)) {
      expect(field.props("disable")).toBe(true);
      expect(field.props("outlined")).toBe(true);
    }
  });

  it("subtracts an offset tuple from each displayed value", () => {
    const wrapper = mountWithQuasar(CoordinateAxisInputs, {
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
    const wrapper = mountWithQuasar(CoordinateAxisInputs, {
      props: { tuple, kind: "position", offset: [10, 20, 30] }
    });

    await editAndBlur(fields(wrapper)[0]!, "5");

    expect(tuple[0]).toBeCloseTo(15, 6);
  });
});
