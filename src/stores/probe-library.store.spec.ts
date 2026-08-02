import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useProbeLibraryStore } from "./probe-library.store";
import { makeProbeInterfaceProbe } from "@/test/fixtures";

describe("useProbeLibraryStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("add", () => {
    it("adds a probe to the library", () => {
      const store = useProbeLibraryStore();
      const probe = makeProbeInterfaceProbe();

      store.add(probe);

      expect(store.library).toEqual([probe]);
    });

    it("dedups probes with the same manufacturer and model, even as distinct object instances", () => {
      const store = useProbeLibraryStore();

      store.add(makeProbeInterfaceProbe());
      store.add(makeProbeInterfaceProbe());

      expect(store.library).toEqual([makeProbeInterfaceProbe()]);
    });

    it("dedups probes with the same identifier even if their geometry differs", () => {
      const store = useProbeLibraryStore();

      store.add(makeProbeInterfaceProbe({ si_units: "um" }));
      store.add(makeProbeInterfaceProbe({ si_units: "mm" }));

      expect(store.library).toEqual([
        makeProbeInterfaceProbe({ si_units: "um" })
      ]);
    });

    it("keeps probes with different identifiers in the library", () => {
      const store = useProbeLibraryStore();

      const first = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      });
      const second = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np2" }
      });
      store.add(first);
      store.add(second);

      expect(store.library).toEqual([first, second]);
    });
  });

  describe("remove", () => {
    it("removes a probe with the same identifier from the library", () => {
      const store = useProbeLibraryStore();
      store.add(makeProbeInterfaceProbe());

      store.remove(makeProbeInterfaceProbe());

      expect(store.library).toEqual([]);
    });

    it("removes all probes with the same identifier", () => {
      const store = useProbeLibraryStore();
      store.library.push(makeProbeInterfaceProbe(), makeProbeInterfaceProbe());

      store.remove(makeProbeInterfaceProbe());

      expect(store.library).toEqual([]);
    });

    it("is a no-op when no probe has that identifier", () => {
      const store = useProbeLibraryStore();
      const kept = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      });
      store.add(kept);

      store.remove(
        makeProbeInterfaceProbe({
          annotations: { manufacturer: "imec", model_name: "np2" }
        })
      );

      expect(store.library).toEqual([kept]);
    });
  });

  describe("reorder", () => {
    it("moves a probe to a later index", () => {
      const store = useProbeLibraryStore();
      const np1 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      });
      const np2 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np2" }
      });
      const np3 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np3" }
      });
      store.library.push(np1, np2, np3);

      store.reorder(0, 2);

      expect(store.library).toEqual([np2, np3, np1]);
    });

    it("moves a probe to an earlier index", () => {
      const store = useProbeLibraryStore();
      const np1 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      });
      const np2 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np2" }
      });
      const np3 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np3" }
      });
      store.library.push(np1, np2, np3);

      store.reorder(2, 0);

      expect(store.library).toEqual([np3, np1, np2]);
    });

    it("is a no-op for equal indices", () => {
      const store = useProbeLibraryStore();
      const np1 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      });
      const np2 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np2" }
      });
      store.library.push(np1, np2);

      store.reorder(1, 1);

      expect(store.library).toEqual([np1, np2]);
    });

    it("is a no-op for an out-of-range index", () => {
      const store = useProbeLibraryStore();
      const np1 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      });
      const np2 = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np2" }
      });
      store.library.push(np1, np2);

      store.reorder(0, 5);

      expect(store.library).toEqual([np1, np2]);
    });
  });
});
