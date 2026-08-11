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
    const notify = vi.fn();
    wrapper.vm.$q.notify = notify;

    const targetItem = wrapper.findAllComponents({ name: "QItem" })[1]!;
    await targetItem.findComponent({ name: "QBtn" }).trigger("click");

    expect(store.library).toHaveLength(3);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(store.library[1]!.name)
      })
    );
  });

  it("removes the coordinate system when the delete confirmation is accepted", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();
    const notify = vi.fn();
    wrapper.vm.$q.notify = notify;
    const target = store.library[1]!.name;

    const targetItem = wrapper.findAllComponents({ name: "QItem" })[1]!;
    await targetItem.findComponent({ name: "QBtn" }).trigger("click");
    const options = notify.mock.calls[0]![0];
    options.actions[1].handler();

    expect(store.library).toHaveLength(2);
    expect(store.library.map(({ name }) => name)).not.toContain(target);
    expect(store.library.map(({ name }) => name)).toContain("Default");
  });

  it("clears the selection when the currently selected coordinate system is deleted", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();
    const currentExperimentStore = useCurrentExperimentStore();
    const notify = vi.fn();
    wrapper.vm.$q.notify = notify;
    currentExperimentStore.selectedInspectable = store.library[1]!;

    const targetItem = wrapper.findAllComponents({ name: "QItem" })[1]!;
    await targetItem.findComponent({ name: "QBtn" }).trigger("click");
    const options = notify.mock.calls[0]![0];
    options.actions[1].handler();

    expect(currentExperimentStore.selectedInspectable).toBeNull();
  });

  it("selects the coordinate system and closes the dialog on row click", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();
    const currentExperimentStore = useCurrentExperimentStore();

    const targetItem = wrapper.findAllComponents({ name: "QItem" })[1]!;
    await targetItem.trigger("click");

    expect(currentExperimentStore.selectedInspectable).toBe(store.library[1]);
    expect(wrapper.emitted("ok")).toBeTruthy();
  });

  it("does nothing when the pinned default row is clicked", async () => {
    const wrapper = await mountDialog();
    const currentExperimentStore = useCurrentExperimentStore();

    const firstItem = wrapper.findAllComponents({ name: "QItem" })[0]!;
    await firstItem.trigger("click");

    expect(currentExperimentStore.selectedInspectable).toBeNull();
    expect(wrapper.emitted("ok")).toBeFalsy();
  });

  it("offers no delete button for the default coordinate system", async () => {
    const wrapper = await mountDialog();

    const items = wrapper.findAllComponents({ name: "QItem" });

    expect(items[0]!.findAllComponents({ name: "QBtn" })).toHaveLength(0);
    expect(items[1]!.findAllComponents({ name: "QBtn" })).toHaveLength(1);
  });

  it("offers no drag handle for the default coordinate system", async () => {
    const wrapper = await mountDialog();

    const items = wrapper.findAllComponents({ name: "QItem" });

    expect(items[0]!.find(".coordinate-system-row__handle").exists()).toBe(
      false
    );
    expect(items[1]!.find(".coordinate-system-row__handle").exists()).toBe(
      true
    );
  });

  it("moves the dragged row to the dropped-on row's index", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();

    const items = wrapper.findAllComponents({ name: "QItem" });
    await items[1]!.find(".coordinate-system-row__handle").trigger("dragstart");
    await items[2]!.trigger("dragover");
    await items[2]!.trigger("drop");

    expect(store.library.map(({ name }) => name)).toEqual([
      "Default",
      "NewScale MIS",
      "Surface Coordinate & Depth"
    ]);
  });

  it("does not let a drag displace the default coordinate system", async () => {
    const wrapper = await mountDialog();
    const store = useCoordinateSystemLibraryStore();
    const before = store.library.map(({ name }) => name);

    const items = wrapper.findAllComponents({ name: "QItem" });
    await items[2]!.find(".coordinate-system-row__handle").trigger("dragstart");
    await items[0]!.trigger("dragover");
    await items[0]!.trigger("drop");

    expect(store.library.map(({ name }) => name)).toEqual(before);
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

    expect(store.library).toHaveLength(4);
    expect(store.library[3]!.name).toBe("Coordinate System 4");
    expect(store.library[3]!.chain).toHaveLength(1);
    expect(store.library[3]!.chain[0]!.position[0]!.mode).toBe("free");
    expect(currentExperimentStore.selectedInspectable).toBe(store.library[3]);
    expect(wrapper.emitted("ok")).toBeTruthy();
  });
});
