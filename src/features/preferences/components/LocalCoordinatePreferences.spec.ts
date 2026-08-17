import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import LocalCoordinatePreferences from "./LocalCoordinatePreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getTerminologyRows } from "@/features/atlas";
import { isOrthogonalLocalCoordinateSystem } from "@/utils/coordinate-frame";
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
 * The depth select, then the forward select.
 * @param wrapper Mounted preferences section to read.
 */
function selects(wrapper: VueWrapper) {
  return wrapper.findAllComponents({ name: "DirectionSelect" });
}

/**
 * Direction shown in the read-only right-axis field.
 * @param wrapper Mounted preferences section to read.
 */
function rightLabel(wrapper: VueWrapper) {
  return wrapper.findComponent({ name: "QInput" }).props("modelValue");
}

describe("LocalCoordinatePreferences", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("shows the resting depth and forward directions", () => {
    const wrapper = mountWithQuasar(LocalCoordinatePreferences);

    expect(selects(wrapper).map(select => select.props("modelValue"))).toEqual([
      "Anterior_to_posterior",
      "Inferior_to_superior"
    ]);
  });

  it("derives the right direction rather than offering it", () => {
    const wrapper = mountWithQuasar(LocalCoordinatePreferences);

    expect(rightLabel(wrapper)).toBe(enUS.direction.rightToLeft);
    expect(wrapper.findComponent({ name: "QInput" }).props("readonly")).toBe(
      true
    );
  });

  it("snaps the forward axis away when depth takes its line", async () => {
    const wrapper = mountWithQuasar(LocalCoordinatePreferences);
    const store = useCurrentExperimentStore();

    await selects(wrapper)[0]!.vm.$emit(
      "update:modelValue",
      "Inferior_to_superior"
    );

    expect(store.localCoordinateSystem).toEqual({
      depthDirection: "Inferior_to_superior",
      forwardDirection: "Anterior_to_posterior"
    });
    expect(isOrthogonalLocalCoordinateSystem(store.localCoordinateSystem)).toBe(
      true
    );
  });

  it("snaps the depth axis away when forward takes its line", async () => {
    const wrapper = mountWithQuasar(LocalCoordinatePreferences);
    const store = useCurrentExperimentStore();

    await selects(wrapper)[1]!.vm.$emit(
      "update:modelValue",
      "Posterior_to_anterior"
    );

    expect(store.localCoordinateSystem).toEqual({
      depthDirection: "Inferior_to_superior",
      forwardDirection: "Posterior_to_anterior"
    });
  });

  it("leaves the other axis alone for a perpendicular pick, and re-derives right", async () => {
    const wrapper = mountWithQuasar(LocalCoordinatePreferences);
    const store = useCurrentExperimentStore();

    await selects(wrapper)[0]!.vm.$emit("update:modelValue", "Left_to_right");
    await wrapper.vm.$nextTick();

    expect(store.localCoordinateSystem).toEqual({
      depthDirection: "Left_to_right",
      forwardDirection: "Inferior_to_superior"
    });
    expect(rightLabel(wrapper)).toBe(enUS.direction.anteriorToPosterior);
  });

  it("reverses a direction without touching the other axis", async () => {
    const wrapper = mountWithQuasar(LocalCoordinatePreferences);
    const store = useCurrentExperimentStore();

    await selects(wrapper)[0]!.vm.$emit(
      "update:modelValue",
      "Posterior_to_anterior"
    );

    expect(store.localCoordinateSystem).toEqual({
      depthDirection: "Posterior_to_anterior",
      forwardDirection: "Inferior_to_superior"
    });
  });
});
