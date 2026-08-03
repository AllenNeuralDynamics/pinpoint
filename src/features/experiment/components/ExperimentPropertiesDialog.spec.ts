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
import {
  getManifest,
  getTerminologyRows,
  type Manifest
} from "@/features/atlas";
import { makeAtlas, makeManifest } from "@/test/fixtures";
import CommittedInput from "@/components/CommittedInput.vue";
import { buildExperiment } from "../api/experiment.api";

// `useCurrentExperimentStore`'s `manifest`/`terminologyRows` are
// `computedAsync`, refetching from the real atlas API whenever the atlas
// changes -- both must be mocked, and this dialog additionally calls
// `getManifest` itself. Mocking the leaf module (rather than the
// `@/features/atlas` barrel it's re-exported through) is required: mocking
// the barrel by the same specifier it re-exports from doesn't consistently
// intercept the store's own import of it.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return { ...actual, getManifest: vi.fn(), getTerminologyRows: vi.fn() };
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
  store.loadExperiment(buildExperiment("Seeded", makeAtlas(), [1, 2, 3]));

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
 * Locate the dialog's AP/DV/ML coordinate fields, in that order.
 * @param wrapper Mounted dialog wrapper.
 */
function coordinateInputs(wrapper: DialogWrapper) {
  return wrapper.findAllComponents(CommittedInput);
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
    vi.mocked(getManifest).mockReset();
    vi.mocked(getTerminologyRows).mockReset();
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  it("seeds all three fields from the store", async () => {
    const wrapper = await mountDialog();

    expect(nameInput(wrapper).find("input").element.value).toBe("Seeded");
    expect(atlasPicker(wrapper).props("modelValue")).toEqual(makeAtlas());

    const coordinates = coordinateInputs(wrapper);
    expect(coordinates[0]!.find("input").element.value).toBe("1");
    expect(coordinates[1]!.find("input").element.value).toBe("2");
    expect(coordinates[2]!.find("input").element.value).toBe("3");
  });

  it("commits name, atlas, and coordinates to the store and emits ok on Save", async () => {
    const wrapper = await mountDialog();
    const store = useCurrentExperimentStore();

    await nameInput(wrapper).setValue("New Name");
    await saveButton(wrapper).trigger("click");
    await flushMicrotasks();

    expect(store.name).toBe("New Name");
    expect(store.atlas).toEqual(makeAtlas());
    expect(store.referenceCoordinate).toEqual([1, 2, 3]);
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

  it("auto-zeros an emptied coordinate field", async () => {
    const wrapper = await mountDialog();
    const ap = coordinateInputs(wrapper)[0]!;

    await editAndBlur(ap, "");

    expect(ap.find("input").element.value).toBe("0");
  });

  it("rejects non-numeric coordinate text, leaving the stored value untouched", async () => {
    const wrapper = await mountDialog();
    const store = useCurrentExperimentStore();
    const ap = coordinateInputs(wrapper)[0]!;

    await editAndBlur(ap, "abc");
    await saveButton(wrapper).trigger("click");
    await flushMicrotasks();

    expect(store.referenceCoordinate[0]).toBe(1);
  });

  it("re-seeds the reference coordinate when a different atlas is picked", async () => {
    const manifest = makeManifest({
      atlas: makeAtlas({ name: "allen_human" }),
      resolutions: [[0.02, 0.02, 0.02]],
      shape: [[100, 100, 100]]
    });
    vi.mocked(getManifest).mockResolvedValue(manifest);

    const wrapper = await mountDialog();
    await atlasPicker(wrapper).vm.$emit(
      "update:modelValue",
      makeAtlas({ name: "allen_human" })
    );
    await flushMicrotasks();

    const coordinates = coordinateInputs(wrapper);
    expect(coordinates[0]!.find("input").element.value).toBe("1");
    expect(coordinates[1]!.find("input").element.value).toBe("1");
    expect(coordinates[2]!.find("input").element.value).toBe("1");
  });

  it("does not re-seed when re-picking an equal but distinct atlas object", async () => {
    const wrapper = await mountDialog();
    const ap = coordinateInputs(wrapper)[0]!;
    await editAndBlur(ap, "42");

    // The store's own `manifest`/`terminologyRows` computedAsyncs call
    // `getManifest` independently of the dialog, so assert no *additional*
    // call happens from the dialog's own re-seed watcher.
    const callsBefore = vi.mocked(getManifest).mock.calls.length;
    await atlasPicker(wrapper).vm.$emit("update:modelValue", makeAtlas());
    await flushMicrotasks();

    expect(getManifest).toHaveBeenCalledTimes(callsBefore);
    expect(coordinateInputs(wrapper)[0]!.find("input").element.value).toBe(
      "42"
    );
  });

  it("disables Save while the atlas manifest fetch is in flight, re-enabling once it resolves", async () => {
    const { promise, resolve } = Promise.withResolvers<Manifest | null>();
    vi.mocked(getManifest).mockReturnValue(promise);

    const wrapper = await mountDialog();
    await atlasPicker(wrapper).vm.$emit(
      "update:modelValue",
      makeAtlas({ name: "allen_human" })
    );
    await flushMicrotasks();

    expect(saveButton(wrapper).props("disable")).toBe(true);

    resolve(makeManifest({ atlas: makeAtlas({ name: "allen_human" }) }));
    await flushMicrotasks();

    expect(saveButton(wrapper).props("disable")).toBe(false);
  });

  it("notifies and leaves the coordinate fields unchanged when the manifest can't be fetched", async () => {
    vi.mocked(getManifest).mockResolvedValue(null);

    const wrapper = await mountDialog();
    const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

    await atlasPicker(wrapper).vm.$emit(
      "update:modelValue",
      makeAtlas({ name: "allen_human" })
    );
    await flushMicrotasks();

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ color: "negative" })
    );
    const coordinates = coordinateInputs(wrapper);
    expect(coordinates[0]!.find("input").element.value).toBe("1");
    expect(coordinates[1]!.find("input").element.value).toBe("2");
    expect(coordinates[2]!.find("input").element.value).toBe("3");
  });
});
