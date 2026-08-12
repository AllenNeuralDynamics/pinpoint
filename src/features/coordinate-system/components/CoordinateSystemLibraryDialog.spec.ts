import { afterEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import CoordinateSystemLibraryDialog from "./CoordinateSystemLibraryDialog.vue";
import {
  createWrapperRegistry,
  mountDialogWithQuasar
} from "@/test/mount-helper";
import { useCoordinateSystemLibraryStore } from "@/stores/coordinate-system-library.store";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import enUS from "@/i18n/en-US";

// Mock the leaf module (not the `@/features/atlas` barrel) -- the current
// experiment store's `terminologyRows` is a `computedAsync` and fetches on
// store creation, so mounting this dialog would trigger real network calls
// otherwise.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

type DialogWrapper = VueWrapper<
  InstanceType<typeof CoordinateSystemLibraryDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

async function mountDialog(): Promise<DialogWrapper> {
  return wrappers.track(
    (await mountDialogWithQuasar(
      CoordinateSystemLibraryDialog
    )) as DialogWrapper
  );
}

/**
 * Stub the dialog's `$q.dialog`, resolving `onOk` immediately (as if the user
 * confirmed) when `confirm` is true, or never (as if the dialog is still
 * open) when it is false.
 * @param wrapper Mounted dialog wrapper to stub `$q` on.
 * @param confirm Whether `onOk`'s callback fires immediately.
 */
function stubConfirmDialog(wrapper: DialogWrapper, confirm: boolean) {
  const chain = { onOk: vi.fn(), onCancel: vi.fn(), onDismiss: vi.fn() };
  chain.onOk.mockImplementation((callback: () => void) => {
    if (confirm) callback();
    return chain;
  });
  chain.onCancel.mockReturnValue(chain);
  chain.onDismiss.mockReturnValue(chain);
  const dialog = vi.fn().mockReturnValue(chain);
  wrapper.vm.$q.dialog = dialog;
  return dialog;
}

describe("CoordinateSystemLibraryDialog", () => {
  afterEach(() => {
    wrappers.unmountAll();
  });

  it("renders one QItem per library entry with its name", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();

    const items = wrapper.findAllComponents({ name: "QItem" });

    expect(items.map(item => item.text())).toEqual(
      store.library.map(coordinateSystem =>
        expect.stringContaining(coordinateSystem.name)
      )
    );
  });

  it("does not remove the coordinate system immediately on delete", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();
    const dialog = stubConfirmDialog(wrapper, false);

    const targetItem = wrapper.findAllComponents({ name: "QItem" })[0]!;
    await targetItem.findComponent({ name: "QBtn" }).trigger("click");

    expect(store.library).toHaveLength(2);
    expect(dialog).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(store.library[0]!.name)
      })
    );
  });

  it("removes the coordinate system when the delete confirmation is accepted", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();
    stubConfirmDialog(wrapper, true);
    const target = store.library[0]!.name;

    const targetItem = wrapper.findAllComponents({ name: "QItem" })[0]!;
    await targetItem.findComponent({ name: "QBtn" }).trigger("click");

    expect(store.library).toHaveLength(1);
    expect(store.library.map(({ name }) => name)).not.toContain(target);
  });

  it("clears the selection when the currently selected coordinate system is deleted", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();
    const currentExperimentStore = useCurrentExperimentStore();
    stubConfirmDialog(wrapper, true);
    currentExperimentStore.selectedInspectable = store.library[0]!;

    const targetItem = wrapper.findAllComponents({ name: "QItem" })[0]!;
    await targetItem.findComponent({ name: "QBtn" }).trigger("click");

    expect(currentExperimentStore.selectedInspectable).toBeNull();
  });

  it("selects the coordinate system and closes the dialog on row click", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();
    const currentExperimentStore = useCurrentExperimentStore();

    const targetItem = wrapper.findAllComponents({ name: "QItem" })[0]!;
    await targetItem.trigger("click");

    expect(currentExperimentStore.selectedInspectable).toBe(store.library[0]);
    expect(wrapper.emitted("ok")).toBeTruthy();
  });

  it("gives every row a drag handle and a delete button", async () => {
    const wrapper = await mountDialog();

    const items = wrapper.findAllComponents({ name: "QItem" });

    for (const item of items) {
      expect(item.find(".coordinate-system-row__handle").exists()).toBe(true);
      expect(item.findAllComponents({ name: "QBtn" })).toHaveLength(1);
    }
  });

  it("moves the dragged row to the dropped-on row's index", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();

    const items = wrapper.findAllComponents({ name: "QItem" });
    await items[0]!.find(".coordinate-system-row__handle").trigger("dragstart");
    await items[1]!.trigger("dragover");
    await items[1]!.trigger("drop");

    expect(store.library.map(({ name }) => name)).toEqual([
      "NewScale MIS",
      "Surface Coordinate & Depth"
    ]);
  });

  it("creates a coordinate system with one adjustable transform and opens it", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();
    const currentExperimentStore = useCurrentExperimentStore();

    const addButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(
        button =>
          button.props("label") ===
          enUS.coordinateSystemLibrary.addCoordinateSystem
      );
    await addButton!.trigger("click");

    expect(store.library).toHaveLength(3);
    expect(store.library[2]!.name).toBe("Coordinate System 3");
    expect(store.library[2]!.chain).toHaveLength(1);
    expect(store.library[2]!.chain[0]!.position[0]!.mode).toBe("free");
    expect(currentExperimentStore.selectedInspectable).toBe(store.library[2]);
    expect(wrapper.emitted("ok")).toBeTruthy();
  });
});
