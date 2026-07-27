import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NewExperimentDialog from "./NewExperimentDialog.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getManifest, getTerminologyRows } from "@/features/atlas";
import { makeAtlas, makeManifest } from "@/test/fixtures";

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

async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

// Dialog content is teleported to `document.body` rather than into
// `wrapper.element`'s subtree, so each mounted dialog must be unmounted after
// its test or a later test's `document.body.querySelector` could pick up a
// leftover teleported node from a previous test.
const mountedWrappers: DialogWrapper[] = [];

// The dialog plugin only renders its content once `show()` (exposed by
// useDialogPluginComponent) is called, and needs to be attached to the DOM
// for its teleported content to be queryable.
async function mountDialog(): Promise<DialogWrapper> {
  const wrapper = mountWithQuasar(NewExperimentDialog, {
    attachTo: document.body,
    global: {
      stubs: { AtlasPicker: true }
    }
  }) as DialogWrapper;
  mountedWrappers.push(wrapper);
  wrapper.vm.show();
  await wrapper.vm.$nextTick();
  await flush();
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
    mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount());
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
      await flush();

      const store = useCurrentExperimentStore();
      expect(store.name).toBe("My Experiment");
      expect(store.atlas).toEqual(atlas);
      expect(store.referenceCoordinate).toEqual([1, 1, 1]);
      // Closing is now driven by `onDialogOK` (so the splash dialog that
      // opened this one can close itself too), not `v-close-popup`.
      expect(wrapper.emitted("ok")).toBeTruthy();
    });

    it("notifies and doesn't create the experiment when the manifest can't be fetched", async () => {
      const atlas = makeAtlas();
      vi.mocked(getManifest).mockResolvedValue(null);

      const wrapper = await mountDialog();
      const store = useCurrentExperimentStore();
      const createSpy = vi.spyOn(store, "create");
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await wrapper.findComponent({ name: "QInput" }).setValue("My Experiment");
      await wrapper
        .findComponent({ name: "AtlasPicker" })
        .vm.$emit("update:modelValue", atlas);

      await createButton(wrapper).trigger("click");
      await flush();

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ color: "negative" })
      );
      expect(createSpy).not.toHaveBeenCalled();
      expect(wrapper.emitted("ok")).toBeFalsy();
    });

    it("does nothing when name or atlas is missing", async () => {
      const wrapper = await mountDialog();
      const store = useCurrentExperimentStore();
      const createSpy = vi.spyOn(store, "create");

      await createButton(wrapper).trigger("click");
      await flush();

      expect(createSpy).not.toHaveBeenCalled();
      expect(wrapper.emitted("ok")).toBeFalsy();
    });
  });
});
