import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp } from "vue";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { flushPromises } from "@vue/test-utils";
import { useCurrentExperimentStore } from "./current-experiment.store";
import {
  getDefaultStructureIdentifiers,
  getManifest,
  getTerminologyRows
} from "@/features/atlas";
import { makeAtlas, makeManifest, makeTerminologyRows } from "@/test/fixtures";

vi.mock("@/features/atlas", () => ({
  BRAINGLOBE_BASE_URL:
    "https://brainglobe.s3.us-west-2.amazonaws.com/atlas-rc2/",
  getDefaultStructureIdentifiers: vi.fn(),
  getManifest: vi.fn(),
  getTerminologyRows: vi.fn()
}));

describe("useCurrentExperimentStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getDefaultStructureIdentifiers).mockReset();
    vi.mocked(getDefaultStructureIdentifiers).mockReturnValue([]);
    vi.mocked(getManifest).mockReset();
    vi.mocked(getTerminologyRows).mockReset();
  });

  describe("create", () => {
    it("replaces the experiment and resets visibleStructures", () => {
      const store = useCurrentExperimentStore();
      const atlas = makeAtlas({ name: "allen_human" });

      store.create("New Experiment", atlas, [1, 2, 3]);

      expect(store.name).toBe("New Experiment");
      expect(store.atlas).toEqual(atlas);
      expect(store.referenceCoordinate).toEqual([1, 2, 3]);
      expect(store.visibleStructures).toEqual([]);
    });
  });

  describe("setName", () => {
    it("updates the experiment's name", () => {
      const store = useCurrentExperimentStore();
      store.setName("Renamed");
      expect(store.name).toBe("Renamed");
    });
  });

  describe("setReferenceCoordinate", () => {
    it("updates the experiment's reference coordinate", () => {
      const store = useCurrentExperimentStore();
      store.setReferenceCoordinate([1, 1, 1]);
      expect(store.referenceCoordinate).toEqual([1, 1, 1]);
    });
  });

  describe("visibleStructures", () => {
    it("get returns the experiment's visibleStructures", () => {
      const store = useCurrentExperimentStore();
      expect(store.visibleStructures).toEqual([]);
    });

    it("set replaces the experiment's visibleStructures", () => {
      const store = useCurrentExperimentStore();
      store.visibleStructures = [1, 2];
      expect(store.experiment.visibleStructures).toEqual([1, 2]);
    });
  });

  describe("isStructureVisible", () => {
    it("returns true when the identifier is in visibleStructures", () => {
      const store = useCurrentExperimentStore();
      store.visibleStructures = [5];
      expect(store.isStructureVisible(5)).toBe(true);
    });

    it("returns false when the identifier is not in visibleStructures", () => {
      const store = useCurrentExperimentStore();
      expect(store.isStructureVisible(5)).toBe(false);
    });
  });

  describe("setStructureVisibility", () => {
    it("adds the identifier when setting visible and not already present", () => {
      const store = useCurrentExperimentStore();
      store.setStructureVisibility(5, true);
      expect(store.visibleStructures).toEqual([5]);
    });

    it("does not duplicate the identifier when already visible", () => {
      const store = useCurrentExperimentStore();
      store.visibleStructures = [5];
      store.setStructureVisibility(5, true);
      expect(store.visibleStructures).toEqual([5]);
    });

    it("removes the identifier when setting invisible and present", () => {
      const store = useCurrentExperimentStore();
      store.visibleStructures = [5, 6];
      store.setStructureVisibility(5, false);
      expect(store.visibleStructures).toEqual([6]);
    });

    it("is a no-op when setting invisible and not present", () => {
      const store = useCurrentExperimentStore();
      store.visibleStructures = [6];
      store.setStructureVisibility(5, false);
      expect(store.visibleStructures).toEqual([6]);
    });
  });

  describe("clearVisibleStructures", () => {
    it("resets visibleStructures to []", () => {
      const store = useCurrentExperimentStore();
      store.visibleStructures = [1, 2, 3];
      store.clearVisibleStructures();
      expect(store.visibleStructures).toEqual([]);
    });
  });

  describe("defaultStructureIdentifiers", () => {
    it("is [] while terminologyRows hasn't resolved", async () => {
      const store = useCurrentExperimentStore();
      await flushPromises();
      expect(store.defaultStructureIdentifiers).toEqual([]);
    });

    it("delegates to getDefaultStructureIdentifiers once terminologyRows resolves", async () => {
      const terminologyRows = makeTerminologyRows();
      vi.mocked(getManifest).mockResolvedValue(makeManifest());
      vi.mocked(getTerminologyRows).mockResolvedValue(terminologyRows);
      vi.mocked(getDefaultStructureIdentifiers).mockReturnValue([7, 8]);

      const store = useCurrentExperimentStore();
      // terminologyRows now depends on manifest, which resolves through its
      // own computedAsync first, so flush an extra microtask round for that
      // hop to settle before terminologyRows's callback re-runs.
      await flushPromises();
      await flushPromises();

      expect(store.terminologyRows).toEqual(terminologyRows);
      // defaultStructureIdentifiers is a lazy computed - read it before
      // asserting on the mock it delegates to.
      expect(store.defaultStructureIdentifiers).toEqual([7, 8]);
      expect(getDefaultStructureIdentifiers).toHaveBeenCalledWith(
        terminologyRows
      );
    });

    it("is [] while the manifest is still evaluating, even once terminologyRows has rows", async () => {
      const terminologyRows = makeTerminologyRows();
      vi.mocked(getManifest).mockResolvedValue(makeManifest());
      vi.mocked(getTerminologyRows).mockResolvedValue(terminologyRows);
      vi.mocked(getDefaultStructureIdentifiers).mockReturnValue([7, 8]);

      const store = useCurrentExperimentStore();
      await flushPromises();
      await flushPromises();
      // terminologyRows has resolved with rows, but re-trigger evaluation by
      // switching the atlas -- the guard must hold even once rows were
      // previously populated, not just before their first resolution.
      vi.mocked(getManifest).mockReturnValue(new Promise(() => {}));
      store.create(
        "New Experiment",
        makeAtlas({ name: "allen_human" }),
        [0, 0, 0]
      );
      await flushPromises();

      expect(store.terminologyRows).toEqual(terminologyRows);
      expect(store.areAtlasComponentsEvaluating).toBe(true);
      expect(store.defaultStructureIdentifiers).toEqual([]);
    });
  });

  describe("areAtlasComponentsEvaluating", () => {
    it("is true while getManifest is still pending", async () => {
      vi.mocked(getManifest).mockReturnValue(new Promise(() => {}));

      const store = useCurrentExperimentStore();
      // `computedAsync`'s `evaluating` flag flips on a microtask after the
      // callback starts, not synchronously with store creation.
      await flushPromises();

      expect(store.areAtlasComponentsEvaluating).toBe(true);
    });

    it("is true while getTerminologyRows is still pending, once the manifest has resolved", async () => {
      vi.mocked(getManifest).mockResolvedValue(makeManifest());
      vi.mocked(getTerminologyRows).mockReturnValue(new Promise(() => {}));

      const store = useCurrentExperimentStore();
      // Let the manifest's own computedAsync resolve before checking that
      // terminologyRows's own evaluating flag has taken over.
      await flushPromises();

      expect(store.manifest).not.toBeNull();
      expect(store.areAtlasComponentsEvaluating).toBe(true);
    });

    it("is false once both the manifest and terminologyRows have resolved", async () => {
      vi.mocked(getManifest).mockResolvedValue(makeManifest());
      vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());

      const store = useCurrentExperimentStore();
      await flushPromises();
      await flushPromises();

      expect(store.areAtlasComponentsEvaluating).toBe(false);
    });
  });

  describe("terminologyRows", () => {
    it("is [] when getManifest resolves null, without calling getTerminologyRows", async () => {
      vi.mocked(getManifest).mockResolvedValue(null);

      const store = useCurrentExperimentStore();
      await flushPromises();
      await flushPromises();

      expect(store.terminologyRows).toEqual([]);
      expect(getTerminologyRows).not.toHaveBeenCalled();
    });

    it("calls getTerminologyRows with the resolved manifest", async () => {
      const manifest = makeManifest();
      vi.mocked(getManifest).mockResolvedValue(manifest);
      vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());

      useCurrentExperimentStore();
      await flushPromises();
      await flushPromises();

      expect(getTerminologyRows).toHaveBeenCalledWith(manifest);
    });
  });

  describe("persistence", () => {
    it("only writes experiment to storage, not the computedAsync-derived state", async () => {
      const terminologyRows = makeTerminologyRows();
      vi.mocked(getManifest).mockResolvedValue(makeManifest());
      vi.mocked(getTerminologyRows).mockResolvedValue(terminologyRows);
      localStorage.removeItem("current-experiment");

      // The default `beforeEach` pinia has no persistence plugin -- build
      // one here so `$subscribe`-driven writes to `localStorage` happen as
      // they would in the app. Pinia only activates plugins registered
      // before an app installs it, so a bare `setActivePinia` (skipping
      // `app.use`) would silently no-op the persistence plugin.
      const pinia = createPinia();
      pinia.use(piniaPluginPersistedstate);
      createApp({}).use(pinia);
      setActivePinia(pinia);

      const store = useCurrentExperimentStore();
      // terminologyRows now depends on manifest resolving first - see the
      // defaultStructureIdentifiers test above.
      await flushPromises();
      await flushPromises();

      // `terminologyRows` is populated (proving it isn't just absent because
      // it hasn't resolved yet), but only `experiment` should have been
      // written to storage.
      expect(store.terminologyRows).toEqual(terminologyRows);
      const persisted = JSON.parse(localStorage.getItem("current-experiment")!);
      expect(Object.keys(persisted)).toEqual(["experiment"]);
    });
  });
});
