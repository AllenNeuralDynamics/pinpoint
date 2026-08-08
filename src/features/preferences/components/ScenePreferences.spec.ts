import { beforeEach, describe, expect, it, vi } from "vitest";
import ScenePreferences from "./ScenePreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getTerminologyRows } from "@/features/atlas";
import enUS from "@/i18n/en-US";

const t = enUS.preferences;

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

describe("ScenePreferences", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("selects the world in the inspector and emits inspectWorld when the button is clicked", async () => {
    const wrapper = mountWithQuasar(ScenePreferences);
    const currentExperiment = useCurrentExperimentStore();

    await wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === t.editInInspector)!
      .trigger("click");

    expect(currentExperiment.selectedInspectable).toEqual({
      inspectableKind: "world"
    });
    expect(wrapper.emitted("inspectWorld")).toBeTruthy();
  });
});
