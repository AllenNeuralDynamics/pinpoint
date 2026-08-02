import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NewExperimentDialog from "./NewExperimentDialog.vue";
import {
  createWrapperRegistry,
  flushMicrotasks,
  mountDialogWithQuasar
} from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getManifest, getTerminologyRows } from "@/features/atlas";
import { makeAtlas, makeManifest, makeProbe } from "@/test/fixtures";

// `useCurrentExperimentStore`'s `manifest` and `terminologyRows` are
// `computedAsync`, refetching from the real atlas API whenever the atlas
// changes -- both must be mocked or mounting this dialog (and clicking
// Create) triggers real network requests. Mocking the leaf module (rather
// than the `@/features/atlas` barrel it's re-exported through) is required:
// mocking the barrel by the same specifier it re-exports from doesn't
// consistently intercept the store's own import of it.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return { ...actual, getManifest: vi.fn(), getTerminologyRows: vi.fn() };
});

type DialogWrapper = VueWrapper<
  InstanceType<typeof NewExperimentDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

async function mountDialog(): Promise<DialogWrapper> {
  const wrapper = wrappers.track(
    (await mountDialogWithQuasar(NewExperimentDialog, {
      global: { stubs: { AtlasPicker: true } }
    })) as DialogWrapper
  );
  await flushMicrotasks();
  return wrapper;
}

function createButton(wrapper: DialogWrapper) {
  return wrapper
    .findAllComponents({ name: "QBtn" })
    .find(btn => btn.text().includes("Create"))!;
}

describe("NewExperimentDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getManifest).mockReset();
    vi.mocked(getTerminologyRows).mockReset();
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  describe("isCreateDisabled", () => {
    it("disables the create button when name and atlas are unset", async () => {
      const wrapper = await mountDialog();
      expect(createButton(wrapper).props("disable")).toBe(true);
    });

    it("stays disabled with only a name set", async () => {
      const wrapper = await mountDialog();
      await wrapper.findComponent({ name: "QInput" }).setValue("My Experiment");

      expect(createButton(wrapper).props("disable")).toBe(true);
    });

    it("enables once both name and atlas are set", async () => {
      const wrapper = await mountDialog();
      await wrapper.findComponent({ name: "QInput" }).setValue("My Experiment");
      await wrapper
        .findComponent({ name: "AtlasPicker" })
        .vm.$emit("update:modelValue", makeAtlas());

      expect(createButton(wrapper).props("disable")).toBe(false);
    });
  });

  describe("create", () => {
    it("seeds the reference coordinate from the atlas's manifest when available", async () => {
      const atlas = makeAtlas();
      const manifest = makeManifest({
        atlas: makeAtlas({ name: "allen_human" }),
        resolutions: [[0.02, 0.02, 0.02]],
        shape: [[100, 100, 100]]
      });
      vi.mocked(getManifest).mockResolvedValue(manifest);

      const wrapper = await mountDialog();
      await wrapper.findComponent({ name: "QInput" }).setValue("My Experiment");
      await wrapper
        .findComponent({ name: "AtlasPicker" })
        .vm.$emit("update:modelValue", atlas);

      await createButton(wrapper).trigger("click");
      await flushMicrotasks();

      const store = useCurrentExperimentStore();
      expect(store.name).toBe("My Experiment");
      expect(store.atlas).toEqual(atlas);
      expect(store.referenceCoordinate).toEqual([1, 1, 1]);
      // Closing is now driven by `onDialogOK` (so the splash dialog that
      // opened this one can close itself too), not `v-close-popup`.
      expect(wrapper.emitted("ok")).toBeTruthy();
    });

    it("clears the selected and dragged probe from the discarded experiment", async () => {
      const atlas = makeAtlas();
      vi.mocked(getManifest).mockResolvedValue(makeManifest());

      const wrapper = await mountDialog();
      const store = useCurrentExperimentStore();
      const staleProbe = makeProbe();
      store.selectedInspectable = staleProbe;
      store.draggedProbeId = staleProbe.id;

      await wrapper.findComponent({ name: "QInput" }).setValue("My Experiment");
      await wrapper
        .findComponent({ name: "AtlasPicker" })
        .vm.$emit("update:modelValue", atlas);
      await createButton(wrapper).trigger("click");
      await flushMicrotasks();

      expect(store.selectedInspectable).toBeNull();
      expect(store.draggedProbeId).toBeNull();
    });

    it("notifies and doesn't create the experiment when the manifest can't be fetched", async () => {
      const atlas = makeAtlas();
      vi.mocked(getManifest).mockResolvedValue(null);

      const wrapper = await mountDialog();
      const store = useCurrentExperimentStore();
      const experimentBeforeClick = store.experiment;
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await wrapper.findComponent({ name: "QInput" }).setValue("My Experiment");
      await wrapper
        .findComponent({ name: "AtlasPicker" })
        .vm.$emit("update:modelValue", atlas);

      await createButton(wrapper).trigger("click");
      await flushMicrotasks();

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ color: "negative" })
      );
      expect(store.experiment).toBe(experimentBeforeClick);
      expect(wrapper.emitted("ok")).toBeFalsy();
    });

    it("does nothing when name or atlas is missing", async () => {
      const wrapper = await mountDialog();
      const store = useCurrentExperimentStore();
      const experimentBeforeClick = store.experiment;

      await createButton(wrapper).trigger("click");
      await flushMicrotasks();

      expect(store.experiment).toBe(experimentBeforeClick);
      expect(wrapper.emitted("ok")).toBeFalsy();
    });
  });
});
