import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import ReferenceCoordinatePreferences from "./ReferenceCoordinatePreferences.vue";
import { flushMicrotasks, mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getTerminologyRows } from "@/features/atlas";
import enUS from "@/i18n/en-US";

// `useCurrentExperimentStore`'s `terminologyRows` is a `computedAsync` and
// fetches on store creation -- mock the leaf module (not the
// `@/features/atlas` barrel) or mounting triggers real network calls.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

/**
 * Focus, replace a field's text, and blur it -- the sequence a real user
 * produces, which `CommittedInput` requires in this order.
 * @param field Field to edit.
 * @param value Text to type into it.
 */
async function editAndBlur(field: VueWrapper, value: string) {
  const native = field.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("focusout");
  await flushMicrotasks();
}

describe("ReferenceCoordinatePreferences", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("edits the experiment's reference coordinate as positions", () => {
    const wrapper = mountWithQuasar(ReferenceCoordinatePreferences);
    const store = useCurrentExperimentStore();

    const inputs = wrapper.findComponent({ name: "CoordinateAxisInputs" });
    expect(wrapper.text()).toContain(enUS.preferences.referenceCoordinateTitle);
    expect(inputs.props("kind")).toBe("position");
    expect(inputs.props("tuple")).toEqual(store.referenceCoordinate);
  });

  it("writes an edited value through to the store", async () => {
    const wrapper = mountWithQuasar(ReferenceCoordinatePreferences);
    const store = useCurrentExperimentStore();

    await editAndBlur(wrapper.findAllComponents({ name: "QInput" })[1]!, "2.5");

    expect(store.referenceCoordinate[1]).toBe(2.5);
  });

  it("shows the coordinate the store holds", async () => {
    const wrapper = mountWithQuasar(ReferenceCoordinatePreferences);
    const store = useCurrentExperimentStore();

    store.referenceCoordinate[2] = 4;
    await wrapper.vm.$nextTick();

    expect(
      wrapper.findAllComponents({ name: "QInput" })[2]!.props("modelValue")
    ).toBe("4.000");
  });
});
