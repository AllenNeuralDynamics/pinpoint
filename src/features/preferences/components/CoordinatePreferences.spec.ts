import { beforeEach, describe, expect, it, vi } from "vitest";
import CoordinatePreferences from "./CoordinatePreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { getTerminologyRows } from "@/features/atlas";

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

describe("CoordinatePreferences", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("composes the global, probe, reference and retention sections", () => {
    const wrapper = mountWithQuasar(CoordinatePreferences);

    for (const name of [
      "GlobalCoordinatePreferences",
      "LocalCoordinatePreferences",
      "ReferenceCoordinatePreferences",
      "RetainCoordinateSystems"
    ]) {
      expect(wrapper.findComponent({ name }).exists()).toBe(true);
    }
  });
});
