import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import ExperimentPropertiesDialog from "./ExperimentPropertiesDialog.vue";
import {
  createWrapperRegistry,
  flushMicrotasks,
  mountDialogWithQuasar
} from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getTerminologyRows } from "@/features/atlas";
import {
  makeAtlas,
  makeExperiment,
  makeManifest,
  makeTerminologyRows
} from "@/test/fixtures";

// `useCurrentExperimentStore`'s `terminologyRows` is `computedAsync`,
// refetching from the real atlas API whenever the atlas changes, so it must
// be mocked. Mocking the leaf module (rather than the `@/features/atlas`
// barrel it's re-exported through) is required: mocking the barrel by the
// same specifier it re-exports from doesn't consistently intercept the
// store's own import of it.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return { ...actual, getTerminologyRows: vi.fn() };
});

type DialogWrapper = VueWrapper<
  InstanceType<typeof ExperimentPropertiesDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

let pinia: Pinia;

/**
 * Mount the dialog against a pre-seeded "Seeded" experiment on the same
 * Pinia instance made active in `beforeEach`.
 */
async function mountDialog(): Promise<DialogWrapper> {
  const store = useCurrentExperimentStore();
  store.loadExperiment(
    makeExperiment({ name: "Seeded", referenceCoordinate: [1, 2, 3] })
  );

  const wrapper = wrappers.track(
    (await mountDialogWithQuasar(ExperimentPropertiesDialog, {
      global: { stubs: { AtlasPicker: true } },
      pinia
    })) as DialogWrapper
  );
  await flushMicrotasks();
  return wrapper;
}

/**
 * Focus, replace a field's text, and blur it -- the sequence a real user
 * produces, which commit-on-blur fields require in this order.
 * @param inputWrapper Wrapper containing the native input to edit.
 * @param value Text to type before blurring.
 */
async function editAndBlur(inputWrapper: VueWrapper, value: string) {
  const native = inputWrapper.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("focusout");
  await flushMicrotasks();
}

/**
 * Locate the dialog's experiment name field.
 * @param wrapper Mounted dialog wrapper.
 */
function nameInput(wrapper: DialogWrapper) {
  return wrapper.findComponent({ name: "QInput" });
}

/**
 * Locate the dialog's Save button.
 * @param wrapper Mounted dialog wrapper.
 */
function saveButton(wrapper: DialogWrapper) {
  return wrapper
    .findAllComponents({ name: "QBtn" })
    .find(btn => btn.text().includes("Save"))!;
}

/**
 * Locate the dialog's stubbed atlas picker.
 * @param wrapper Mounted dialog wrapper.
 */
function atlasPicker(wrapper: DialogWrapper) {
  return wrapper.findComponent({ name: "AtlasPicker" });
}

describe("ExperimentPropertiesDialog", () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.mocked(getTerminologyRows).mockReset();
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  it("seeds the name and atlas from the store", async () => {
    const wrapper = await mountDialog();

    expect(nameInput(wrapper).find("input").element.value).toBe("Seeded");
    expect(atlasPicker(wrapper).props("modelValue")).toEqual(makeAtlas());
  });

  it("commits the name and atlas to the store and emits ok on Save", async () => {
    const wrapper = await mountDialog();
    const store = useCurrentExperimentStore();

    await nameInput(wrapper).setValue("New Name");
    await saveButton(wrapper).trigger("click");
    await flushMicrotasks();

    expect(store.name).toBe("New Name");
    expect(store.atlas).toEqual(makeAtlas());
    expect(wrapper.emitted("ok")).toBeTruthy();
  });

  it("leaves store.name unchanged when the name is edited but Save isn't clicked", async () => {
    const wrapper = await mountDialog();
    const store = useCurrentExperimentStore();

    await nameInput(wrapper).setValue("Not Saved");

    expect(store.name).toBe("Seeded");
  });

  it("disables Save when the name is cleared, re-enabling once refilled", async () => {
    const wrapper = await mountDialog();

    await editAndBlur(nameInput(wrapper), "");
    expect(saveButton(wrapper).props("disable")).toBe(true);

    await editAndBlur(nameInput(wrapper), "Refilled");
    expect(saveButton(wrapper).props("disable")).toBe(false);
  });

  it("re-seeds the reference coordinate when a different atlas is picked and saved", async () => {
    const wrapper = await mountDialog();
    const store = useCurrentExperimentStore();

    await atlasPicker(wrapper).vm.$emit(
      "update:modelValue",
      makeAtlas({
        name: "allen_human",
        manifest: makeManifest({
          resolutions: [[0.02, 0.02, 0.02]],
          shape: [[100, 100, 100]]
        })
      })
    );
    await flushMicrotasks();
    await saveButton(wrapper).trigger("click");
    await flushMicrotasks();

    // The new atlas's centre is 1 mm along each of its own axes. The
    // experiment's default right-anterior-superior system reads the atlas's ml
    // axis, which already points to the animal's right, as its own x, and
    // negates the anterior-posterior axis; the reference coordinate sits at
    // the top of the atlas, so its superior-inferior value is 0.
    expect(store.referenceCoordinate[0]).toBeCloseTo(1);
    expect(store.referenceCoordinate[1]).toBeCloseTo(-1);
    expect(store.referenceCoordinate[2]).toBeCloseTo(0);
  });

  it("re-seeds default structures when a different atlas is picked and saved", async () => {
    vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());
    const wrapper = await mountDialog();

    await atlasPicker(wrapper).vm.$emit(
      "update:modelValue",
      makeAtlas({ name: "african_molerat" })
    );
    await flushMicrotasks();
    await saveButton(wrapper).trigger("click");
    await flushMicrotasks();

    const store = useCurrentExperimentStore();
    expect(store.visibleStructures).toEqual([{ id: 8, isTransparent: true }]);
  });

  it("keeps the reference coordinate when re-picking an equal but distinct atlas object", async () => {
    const wrapper = await mountDialog();
    const store = useCurrentExperimentStore();

    await atlasPicker(wrapper).vm.$emit("update:modelValue", makeAtlas());
    await flushMicrotasks();
    await saveButton(wrapper).trigger("click");
    await flushMicrotasks();

    expect(store.referenceCoordinate).toEqual([1, 2, 3]);
  });
});
