import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, isReactive, nextTick, watch } from "vue";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { flushPromises } from "@vue/test-utils";
import { useCurrentExperimentStore } from "./current-experiment.store";
import {
  DEFAULT_ATLAS,
  getDefaultStructureIdentifiers,
  getTerminologyRows
} from "@/features/atlas";
import type { TerminologyRow } from "@/features/atlas";
import {
  addProbe,
  buildExperiment,
  internProbeInterfaceProbe
} from "@/features/experiment";
import { buildProbe, getProbeInterfaceIdentifier } from "@/features/probe";
import {
  makeAtlas,
  makeProbe,
  makeProbeInterfaceProbe,
  makeTerminologyRows
} from "@/test/fixtures";

/**
 * Build a Pinia instance with the persistence plugin actually wired up (as
 * in the running app), rather than the bare `setActivePinia(createPinia())`
 * most of this file uses. Needed for tests that assert on `localStorage` or
 * on `$subscribe`-driven behavior, since Pinia only activates plugins
 * registered before an app installs it.
 */
function usePersistedPinia() {
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  createApp({}).use(pinia);
  setActivePinia(pinia);
  return pinia;
}

// Mock the leaf module (not the `@/features/atlas` barrel) -- the store's
// `terminologyRows` is a `computedAsync` and fetches on store creation, so
// mounting would trigger real network calls otherwise.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

describe("useCurrentExperimentStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getTerminologyRows).mockReset();
  });

  describe("visibleStructures", () => {
    it("get returns the experiment's seeded default structures", () => {
      const store = useCurrentExperimentStore();
      expect(store.visibleStructures).toEqual(
        getDefaultStructureIdentifiers(DEFAULT_ATLAS.name, []).map(id => ({
          id,
          isTransparent: true
        }))
      );
    });
  });

  describe("atlas", () => {
    it("defaults to DEFAULT_ATLAS", () => {
      const store = useCurrentExperimentStore();
      expect(store.atlas).toEqual(DEFAULT_ATLAS);
    });

    it("does not mutate the exported DEFAULT_ATLAS when the store's atlas is mutated", () => {
      const store = useCurrentExperimentStore();

      store.experiment.atlas.name = "mutated";

      expect(DEFAULT_ATLAS.name).not.toBe("mutated");
    });
  });

  describe("isTerminologyRowsEvaluating", () => {
    it("is true while getTerminologyRows is still pending", async () => {
      const { promise } = Promise.withResolvers<TerminologyRow[]>();
      vi.mocked(getTerminologyRows).mockReturnValue(promise);

      const store = useCurrentExperimentStore();
      // `computedAsync`'s `evaluating` flag flips on a microtask after the
      // callback starts, not synchronously with store creation.
      await flushPromises();

      expect(store.isTerminologyRowsEvaluating).toBe(true);
    });

    it("is false once getTerminologyRows has resolved", async () => {
      vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());

      const store = useCurrentExperimentStore();
      await flushPromises();
      await flushPromises();

      expect(store.isTerminologyRowsEvaluating).toBe(false);
    });
  });

  describe("terminologyRows", () => {
    it("calls getTerminologyRows with the current atlas", async () => {
      const terminologyRows = makeTerminologyRows();
      vi.mocked(getTerminologyRows).mockResolvedValue(terminologyRows);

      const store = useCurrentExperimentStore();
      await flushPromises();
      await flushPromises();

      expect(getTerminologyRows).toHaveBeenCalledWith(store.atlas);
      expect(store.terminologyRows).toEqual(terminologyRows);
    });
  });

  describe("persistence", () => {
    it("only writes experiment to storage, not the computedAsync-derived state", async () => {
      const terminologyRows = makeTerminologyRows();
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

  describe("isInspectableSelected", () => {
    it("returns false when nothing is selected", () => {
      const store = useCurrentExperimentStore();
      const probe = makeProbe();

      expect(store.isInspectableSelected(probe)).toBe(false);
    });

    it("returns true when the entity matches the current selection", () => {
      const store = useCurrentExperimentStore();
      const probe = makeProbe({ id: "A" });
      store.selectedInspectable = probe;

      expect(store.isInspectableSelected(probe)).toBe(true);
    });

    it("returns false when the entity's id does not match the current selection", () => {
      const store = useCurrentExperimentStore();
      store.selectedInspectable = makeProbe({ id: "A" });

      expect(store.isInspectableSelected(makeProbe({ id: "B" }))).toBe(false);
    });

    it("returns true for a renamed probe with the same id", () => {
      const store = useCurrentExperimentStore();
      const probe = makeProbe({ id: "A", name: "Before" });
      store.selectedInspectable = probe;

      probe.name = "After";

      expect(store.isInspectableSelected(probe)).toBe(true);
    });
  });

  describe("loadExperiment", () => {
    it("replaces the current experiment", () => {
      const store = useCurrentExperimentStore();
      const newExperiment = buildExperiment(
        "Loaded Experiment",
        makeAtlas({ name: "allen_human" }),
        [1, 2, 3]
      );

      store.loadExperiment(newExperiment);

      expect(store.name).toBe("Loaded Experiment");
      expect(store.atlas).toEqual(makeAtlas({ name: "allen_human" }));
    });

    it("clears the selected inspectable and dragged probe id", () => {
      const store = useCurrentExperimentStore();
      store.selectedInspectable = makeProbe();
      store.draggedProbeId = "some-id";

      store.loadExperiment(
        buildExperiment("Loaded Experiment", makeAtlas(), [0, 0, 0])
      );

      expect(store.selectedInspectable).toBeNull();
      expect(store.draggedProbeId).toBeNull();
    });

    it("detaches the loaded experiment's probe interface definitions from reactivity", () => {
      const store = useCurrentExperimentStore();
      const newExperiment = buildExperiment(
        "Loaded Experiment",
        makeAtlas(),
        [0, 0, 0]
      );
      const spec = makeProbeInterfaceProbe();
      const identifier = getProbeInterfaceIdentifier(spec);
      internProbeInterfaceProbe(newExperiment, spec);

      store.loadExperiment(newExperiment);

      const loadedDefinition = store.probeInterfaceProbes[identifier]!;
      expect(loadedDefinition).toEqual(spec);
      expect(isReactive(loadedDefinition)).toBe(false);
    });

    it("writes the loaded experiment to storage", async () => {
      usePersistedPinia();
      localStorage.removeItem("current-experiment");

      const store = useCurrentExperimentStore();
      store.loadExperiment(
        buildExperiment("Loaded Experiment", makeAtlas(), [0, 0, 0])
      );
      await nextTick();

      const persisted = JSON.parse(localStorage.getItem("current-experiment")!);
      expect(persisted.experiment.name).toBe("Loaded Experiment");
    });
  });

  describe("probe persistence and reactivity", () => {
    it("persists interned definitions as part of the experiment", async () => {
      usePersistedPinia();
      localStorage.removeItem("current-experiment");

      const store = useCurrentExperimentStore();
      const spec = makeProbeInterfaceProbe();
      const identifier = getProbeInterfaceIdentifier(spec);
      internProbeInterfaceProbe(store.experiment, spec);
      addProbe(store.experiment, buildProbe(spec));
      await nextTick();

      const persisted = JSON.parse(localStorage.getItem("current-experiment")!);
      expect(persisted.experiment.probeInterfaceProbes).toEqual({
        [identifier]: spec
      });
      expect(persisted.experiment.probes[0].probeInterfaceIdentifier).toBe(
        identifier
      );
    });

    it("re-detaches definitions from reactivity after hydrating from storage", async () => {
      usePersistedPinia();
      localStorage.removeItem("current-experiment");

      const firstStore = useCurrentExperimentStore();
      const spec = makeProbeInterfaceProbe();
      const identifier = getProbeInterfaceIdentifier(spec);
      internProbeInterfaceProbe(firstStore.experiment, spec);
      addProbe(firstStore.experiment, buildProbe(spec));
      await nextTick();

      // A fresh store over the same storage simulates a page reload.
      usePersistedPinia();
      const rehydratedStore = useCurrentExperimentStore();

      expect(Object.keys(rehydratedStore.probeInterfaceProbes)).toHaveLength(1);
      const rehydratedDefinition =
        rehydratedStore.probeInterfaceProbes[identifier]!;
      expect(rehydratedDefinition).toEqual(makeProbeInterfaceProbe());
      // `markRaw` doesn't survive the JSON round-trip on its own -- this
      // guards the `afterHydrate` hook that re-applies it.
      expect(isReactive(rehydratedDefinition)).toBe(false);
    });

    it("keeps the probe itself reactive even though its definition is not", async () => {
      const store = useCurrentExperimentStore();
      const spec = makeProbeInterfaceProbe();
      internProbeInterfaceProbe(store.experiment, spec);
      addProbe(store.experiment, buildProbe(spec));

      let visibilityChanges = 0;
      // `store.probes[0]` is the reactive proxy Pinia hands back, unlike the
      // raw probe object passed into `addProbe`.
      const stored = store.probes[0]!;
      const stop = watch(
        () => stored.visibility,
        () => visibilityChanges++
      );
      stored.visibility = "hidden";
      await nextTick();
      stop();

      expect(visibilityChanges).toBe(1);
    });
  });

  describe("undo/redo", () => {
    it("has no history until the experiment changes", () => {
      const store = useCurrentExperimentStore();

      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
    });

    it("undoes and redoes an experiment mutation", async () => {
      const store = useCurrentExperimentStore();
      const defaultName = store.name;

      store.experiment.name = "Renamed";
      await nextTick();
      expect(store.canUndo).toBe(true);

      store.undo();
      expect(store.name).toBe(defaultName);

      store.redo();
      expect(store.name).toBe("Renamed");
    });

    it("keeps redo available after an undo", async () => {
      const store = useCurrentExperimentStore();

      store.experiment.name = "Renamed";
      await nextTick();
      store.undo();
      await nextTick();

      expect(store.canRedo).toBe(true);
    });

    it("keeps probe interface definitions detached after undo", async () => {
      const store = useCurrentExperimentStore();
      const spec = makeProbeInterfaceProbe();
      const identifier = getProbeInterfaceIdentifier(spec);
      internProbeInterfaceProbe(store.experiment, spec);
      addProbe(store.experiment, buildProbe(spec));
      await nextTick();

      store.experiment.name = "Renamed";
      await nextTick();
      store.undo();

      expect(isReactive(store.probeInterfaceProbes[identifier])).toBe(false);
    });

    it("re-points the selection at the restored probe", async () => {
      const store = useCurrentExperimentStore();
      const spec = makeProbeInterfaceProbe();
      internProbeInterfaceProbe(store.experiment, spec);
      addProbe(store.experiment, buildProbe(spec));
      await nextTick();

      store.selectedInspectable = store.probes[0]!;
      store.probes[0]!.name = "Renamed";
      await nextTick();
      store.undo();

      expect(store.selectedInspectable).toBe(store.probes[0]);
    });

    it("re-points the selection at the restored camera pose object after undo", async () => {
      const store = useCurrentExperimentStore();
      store.selectedInspectable = store.experiment.cameraPose;
      const preUndoCameraPose = store.experiment.cameraPose;

      store.experiment.cameraPose.alpha = 1;
      await nextTick();
      store.undo();

      expect(store.selectedInspectable).toBe(store.experiment.cameraPose);
      expect(store.selectedInspectable).not.toBe(preUndoCameraPose);
    });

    it("clears the selection when undo removes the selected probe", async () => {
      const store = useCurrentExperimentStore();
      const spec = makeProbeInterfaceProbe();
      internProbeInterfaceProbe(store.experiment, spec);
      addProbe(store.experiment, buildProbe(spec));
      await nextTick();

      store.selectedInspectable = store.probes[0]!;
      store.undo();

      expect(store.probes).toHaveLength(0);
      expect(store.selectedInspectable).toBeNull();
    });

    it("resets history when another experiment is loaded", async () => {
      const store = useCurrentExperimentStore();
      store.experiment.name = "Renamed";
      await nextTick();
      expect(store.canUndo).toBe(true);

      store.loadExperiment(buildExperiment("Loaded", makeAtlas(), [0, 0, 0]));

      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);

      await nextTick();

      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
    });

    it("starts with no history after hydrating from storage", async () => {
      usePersistedPinia();
      localStorage.removeItem("current-experiment");

      const firstStore = useCurrentExperimentStore();
      firstStore.experiment.name = "Renamed";
      await nextTick();

      usePersistedPinia();
      const rehydratedStore = useCurrentExperimentStore();
      await nextTick();

      expect(rehydratedStore.canUndo).toBe(false);
      expect(rehydratedStore.name).toBe("Renamed");
    });

    it("holds the atlas reference across an undo that leaves the atlas unchanged", async () => {
      const store = useCurrentExperimentStore();

      store.experiment.name = "Renamed";
      await nextTick();
      const atlasBefore = store.atlas;

      store.undo();

      expect(store.atlas).toBe(atlasBefore);
    });

    it("does not refetch the terminology rows when the atlas is unchanged", async () => {
      vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());
      const store = useCurrentExperimentStore();
      await flushPromises();
      await flushPromises();
      vi.mocked(getTerminologyRows).mockClear();

      store.experiment.name = "Renamed";
      await nextTick();
      store.undo();
      await flushPromises();
      await flushPromises();

      expect(getTerminologyRows).not.toHaveBeenCalled();
    });

    it("re-points the atlas and refetches when an undo restores a different atlas", async () => {
      vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());
      const store = useCurrentExperimentStore();
      await flushPromises();
      await flushPromises();

      store.experiment.atlas = makeAtlas({ name: "allen_human" });
      await nextTick();
      await flushPromises();
      await flushPromises();
      vi.mocked(getTerminologyRows).mockClear();

      store.undo();
      await flushPromises();
      await flushPromises();

      expect(store.atlas.name).toBe(DEFAULT_ATLAS.name);
      expect(getTerminologyRows).toHaveBeenCalled();
    });
  });

  describe("probe drag history", () => {
    it("collapses a drag into one history point", async () => {
      const store = useCurrentExperimentStore();
      const spec = makeProbeInterfaceProbe();
      internProbeInterfaceProbe(store.experiment, spec);
      addProbe(store.experiment, buildProbe(spec));
      await nextTick();

      store.draggedProbeId = store.probes[0]!.id;
      store.probes[0]!.tipPosition = [1, 0, 0];
      await nextTick();
      store.probes[0]!.tipPosition = [2, 0, 0];
      await nextTick();
      store.endProbeDrag();

      expect(store.probes[0]!.tipPosition).toEqual([2, 0, 0]);

      store.undo();
      expect(store.probes[0]!.tipPosition).toEqual([0, 0, 0]);
    });

    it("redoes a drag as one step", async () => {
      const store = useCurrentExperimentStore();
      const spec = makeProbeInterfaceProbe();
      internProbeInterfaceProbe(store.experiment, spec);
      addProbe(store.experiment, buildProbe(spec));
      await nextTick();

      store.draggedProbeId = store.probes[0]!.id;
      store.probes[0]!.tipPosition = [1, 0, 0];
      await nextTick();
      store.probes[0]!.tipPosition = [2, 0, 0];
      await nextTick();
      store.endProbeDrag();
      store.undo();

      store.redo();

      expect(store.probes[0]!.tipPosition).toEqual([2, 0, 0]);
    });

    it("records nothing when no drag was in progress", () => {
      const store = useCurrentExperimentStore();

      store.endProbeDrag();

      expect(store.canUndo).toBe(false);
      expect(store.draggedProbeId).toBeNull();
    });

    it("resumes recording once the drag ends", async () => {
      const store = useCurrentExperimentStore();
      const spec = makeProbeInterfaceProbe();
      internProbeInterfaceProbe(store.experiment, spec);
      addProbe(store.experiment, buildProbe(spec));
      await nextTick();
      const defaultName = store.name;

      store.draggedProbeId = store.probes[0]!.id;
      store.probes[0]!.tipPosition = [1, 0, 0];
      await nextTick();
      store.endProbeDrag();

      store.experiment.name = "Renamed";
      await nextTick();
      store.undo();

      expect(store.name).toBe(defaultName);
    });
  });
});
