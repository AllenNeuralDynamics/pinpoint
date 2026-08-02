import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRecentExperimentsStore } from "./recent-experiments.store";
import { buildExperiment } from "@/features/experiment";
import { makeAtlas } from "@/test/fixtures";

describe("useRecentExperimentsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("add", () => {
    it("adds an experiment as the newest entry", () => {
      const store = useRecentExperimentsStore();
      const experiment = buildExperiment("A", makeAtlas(), [0, 0, 0]);

      store.add(experiment);

      expect(store.recents).toEqual([experiment]);
    });

    it("puts a newly added experiment ahead of older ones", () => {
      const store = useRecentExperimentsStore();
      const first = buildExperiment("A", makeAtlas(), [0, 0, 0]);
      const second = buildExperiment("B", makeAtlas(), [0, 0, 0]);

      store.add(first);
      store.add(second);

      expect(store.recents).toEqual([second, first]);
    });

    it("moves a re-added experiment to the front instead of duplicating it", () => {
      const store = useRecentExperimentsStore();
      const first = buildExperiment("A", makeAtlas(), [0, 0, 0]);
      const second = buildExperiment("B", makeAtlas(), [0, 0, 0]);
      store.add(first);
      store.add(second);

      store.add(first);

      expect(store.recents).toEqual([first, second]);
    });
  });

  describe("remove", () => {
    it("removes the experiment by id", () => {
      const store = useRecentExperimentsStore();
      const experiment = buildExperiment("A", makeAtlas(), [0, 0, 0]);
      store.add(experiment);

      store.remove(experiment);

      expect(store.recents).toEqual([]);
    });

    it("is a no-op when the experiment isn't present", () => {
      const store = useRecentExperimentsStore();
      const experiment = buildExperiment("A", makeAtlas(), [0, 0, 0]);

      expect(() => store.remove(experiment)).not.toThrow();
      expect(store.recents).toEqual([]);
    });
  });
});
