import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import type { AbstractEngine } from "@babylonjs/core";
import SceneHierarchy from "./SceneHierarchy.vue";
import {
  createWrapperRegistry,
  flushMicrotasks,
  mountWithQuasar
} from "@/test/mount-helper";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getAtlasCenter, getTerminologyRows } from "@/features/atlas";
import { getInternedProbeInterfaceProbe } from "@/features/experiment";
import {
  makeProbe,
  makeProbeInterfaceProbe,
  makeSceneObject
} from "@/test/fixtures";
import { BabylonRuntimeServiceKey } from "@/services/babylon-runtime.service";
import { canLoadModelFile } from "../api/model-file.api";
import { putSceneModel } from "../api/scene-model.api";

// `useCurrentExperimentStore`'s `manifest`/`terminologyRows` are
// `computedAsync` and fetch on store creation -- mock the leaf module (not
// the `@/features/atlas` barrel) or mounting triggers real network calls.
// Mirrors the mocking approach in SceneCanvas.spec.ts.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn(),
    getAtlasCenter: vi.fn()
  };
});

// Mock the leaf modules the model-file picker's handler calls, not the
// `@/features/scene` barrel, mirroring `current-experiment.store.spec.ts`.
vi.mock("../api/model-file.api", () => ({
  canLoadModelFile: vi.fn()
}));
vi.mock("../api/scene-model.api", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../api/scene-model.api")>();
  return {
    ...actual,
    putSceneModel: vi.fn()
  };
});

// `useFileDialog`'s input is never attached to the DOM, so it can't be
// driven through a queryable `<input type="file">`. Replace it with a fake
// that records the registered `onChange` callback and an `open` spy,
// mirroring `useExperimentFile.spec.ts`.
const openModelFileDialogSpy = vi.fn();
let capturedOnModelFileChange:
  | ((files: FileList | null) => void | Promise<void>)
  | null = null;

vi.mock("@vueuse/core", async importOriginal => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...actual,
    useFileDialog: () => ({
      files: { value: null },
      open: openModelFileDialogSpy,
      reset: vi.fn(),
      onChange: (
        callback: (files: FileList | null) => void | Promise<void>
      ) => {
        capturedOnModelFileChange = callback;
      },
      onCancel: vi.fn()
    })
  };
});

/**
 * Build a fake `FileList` containing a single file, matching what a real
 * file input's `change` event would provide.
 */
function makeFileList(file: File): FileList {
  return { 0: file, length: 1, item: () => file } as unknown as FileList;
}

// The "Add Probe" dropdown's content is teleported to `document.body`
// rather than into `wrapper.element`'s subtree (Quasar's `QMenu`), so each
// mounted instance must be attached to, and torn down from, `document.body`
// -- otherwise a leftover teleported node from one test could be picked up
// by `document.body.querySelector` in another.
const wrappers = createWrapperRegistry<VueWrapper>();

async function mountHierarchy(pinia: Pinia) {
  return wrappers.track(
    mountWithQuasar(SceneHierarchy, {
      pinia,
      attachTo: document.body,
      global: {
        provide: {
          [BabylonRuntimeServiceKey as symbol]: {
            engine: { value: {} as AbstractEngine }
          }
        }
      }
    })
  );
}

/**
 * Open the "Add Probe" dropdown and click its first library entry.
 */
async function pickFirstLibraryProbe() {
  document
    .querySelector<HTMLButtonElement>(".q-btn-dropdown__arrow-container")
    ?.closest("button")
    ?.click();
  await new Promise(resolve => setTimeout(resolve));

  const entry = document.querySelector<HTMLElement>("[role='menu'] .q-item");
  entry?.click();
  await new Promise(resolve => setTimeout(resolve));
}

describe("SceneHierarchy", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
    vi.mocked(getAtlasCenter).mockReturnValue([0, 0, 0]);
    openModelFileDialogSpy.mockReset();
    capturedOnModelFileChange = null;
    vi.mocked(canLoadModelFile).mockReset();
    vi.mocked(putSceneModel).mockReset();
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  it("interns the picked library probe's definition before adding a probe", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    const currentExperiment = useCurrentExperimentStore(pinia);
    const spec = makeProbeInterfaceProbe({
      annotations: { manufacturer: "imec", model_name: "np1" }
    });
    probeLibrary.add(spec);

    await mountHierarchy(pinia);
    await pickFirstLibraryProbe();

    expect(currentExperiment.probes).toHaveLength(1);
    const [probe] = currentExperiment.probes;
    expect(
      getInternedProbeInterfaceProbe(currentExperiment.experiment, probe!)
    ).toEqual(spec);
  });

  it("reuses the same definition id when the same probe is added twice", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    const currentExperiment = useCurrentExperimentStore(pinia);
    probeLibrary.add(makeProbeInterfaceProbe());

    await mountHierarchy(pinia);
    await pickFirstLibraryProbe();
    await pickFirstLibraryProbe();

    expect(currentExperiment.probes).toHaveLength(2);
    expect(Object.keys(currentExperiment.probeInterfaceProbes)).toHaveLength(1);
    const [a, b] = currentExperiment.probes;
    expect(a!.probeInterfaceIdentifier).toBe(b!.probeInterfaceIdentifier);
  });

  it("removes a probe's definition from the experiment along with the probe", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    const currentExperiment = useCurrentExperimentStore(pinia);
    probeLibrary.add(makeProbeInterfaceProbe());

    const wrapper = await mountHierarchy(pinia);
    await pickFirstLibraryProbe();

    const deleteButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(btn => btn.props("icon") === "delete")!;
    await deleteButton.trigger("click");

    expect(currentExperiment.probes).toEqual([]);
    expect(currentExperiment.probeInterfaceProbes).toEqual({});
  });

  it("selects the newly added probe", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    const currentExperiment = useCurrentExperimentStore(pinia);
    probeLibrary.add(makeProbeInterfaceProbe());

    await mountHierarchy(pinia);
    await pickFirstLibraryProbe();

    const [probe] = currentExperiment.probes;
    expect(currentExperiment.selectedInspectable).toEqual(probe);
  });

  it("deselects the probe once it's removed", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    const currentExperiment = useCurrentExperimentStore(pinia);
    probeLibrary.add(makeProbeInterfaceProbe());

    const wrapper = await mountHierarchy(pinia);
    await pickFirstLibraryProbe();

    const deleteButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(btn => btn.props("icon") === "delete")!;
    await deleteButton.trigger("click");

    expect(currentExperiment.selectedInspectable).toBeNull();
  });

  it("leaves a different, still-selected probe alone when another is removed", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    const currentExperiment = useCurrentExperimentStore(pinia);
    probeLibrary.add(makeProbeInterfaceProbe());

    const wrapper = await mountHierarchy(pinia);
    await pickFirstLibraryProbe();
    await pickFirstLibraryProbe(); // addProbeAndSelect selects the most recently added
    const [, kept] = currentExperiment.probes;

    const deleteButtons = wrapper
      .findAllComponents({ name: "QBtn" })
      .filter(btn => btn.props("icon") === "delete");
    // Probes render in the same order as `currentExperiment.probes`; remove
    // the first (unselected) one and leave the second (selected) one alone.
    await deleteButtons[0]!.trigger("click");

    expect(currentExperiment.probes).toEqual([kept]);
    expect(currentExperiment.selectedInspectable).toEqual(kept);
  });

  it("labels the dropdown entry with the probe's display name, falling back to the raw model name when unknown", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    useCurrentExperimentStore(pinia);
    probeLibrary.add(
      makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      })
    );

    await mountHierarchy(pinia);
    document
      .querySelector<HTMLButtonElement>(".q-btn-dropdown__arrow-container")
      ?.closest("button")
      ?.click();
    await new Promise(resolve => setTimeout(resolve));

    const entry = document.querySelector<HTMLElement>("[role='menu'] .q-item");
    expect(entry?.textContent?.trim()).toBe("IMEC np1");
  });

  it("labels the dropdown entry with the known probe description when recognized", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    useCurrentExperimentStore(pinia);
    probeLibrary.add(
      makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "NP1000" }
      })
    );

    await mountHierarchy(pinia);
    document
      .querySelector<HTMLButtonElement>(".q-btn-dropdown__arrow-container")
      ?.closest("button")
      ?.click();
    await new Promise(resolve => setTimeout(resolve));

    const entry = document.querySelector<HTMLElement>("[role='menu'] .q-item");
    expect(entry?.textContent?.trim()).toBe(
      "IMEC Neuropixels 1.0 probe (NP1000)"
    );
  });

  it("tints and marks the selected probe's row", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const currentExperiment = useCurrentExperimentStore(pinia);
    currentExperiment.experiment.probes = [
      makeProbe({ name: "A" }),
      makeProbe({ name: "B" })
    ];
    currentExperiment.selectedInspectable =
      currentExperiment.experiment.probes[0]!;

    const wrapper = await mountHierarchy(pinia);

    const rows = wrapper.findAll(".probe-list .q-item");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.classes()).toContain("hierarchy-item--active");
    expect(rows[0]!.attributes("aria-current")).toBe("true");
    expect(rows[1]!.classes()).not.toContain("hierarchy-item--active");
    expect(rows[1]!.attributes("aria-current")).toBeUndefined();
  });

  it("moves the dragged probe row to the dropped-on row's index", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const currentExperiment = useCurrentExperimentStore(pinia);
    const [a, b, c] = [
      makeProbe({ name: "A" }),
      makeProbe({ name: "B" }),
      makeProbe({ name: "C" })
    ];
    currentExperiment.experiment.probes = [a, b, c];

    const wrapper = await mountHierarchy(pinia);
    const rows = wrapper.findAll(".probe-list .q-item");
    await rows[0]!.find(".hierarchy-row__handle").trigger("dragstart");
    await rows[2]!.trigger("dragover");
    await rows[2]!.trigger("drop");

    expect(currentExperiment.experiment.probes).toEqual([b, c, a]);
  });

  it("is a no-op when a probe row is dropped without a preceding dragstart", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const currentExperiment = useCurrentExperimentStore(pinia);
    const probes = [makeProbe({ name: "A" }), makeProbe({ name: "B" })];
    currentExperiment.experiment.probes = [...probes];

    const wrapper = await mountHierarchy(pinia);
    const rows = wrapper.findAll(".probe-list .q-item");
    await rows[1]!.trigger("drop");

    expect(currentExperiment.experiment.probes).toEqual(probes);
  });

  describe("scene objects", () => {
    it("adds a scene object named after a picked file, selects it, and stores its model file", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const currentExperiment = useCurrentExperimentStore(pinia);
      vi.mocked(canLoadModelFile).mockResolvedValue(true);
      const file = new File([new Uint8Array([1, 2, 3])], "Brain Model.glb", {
        type: "model/gltf-binary"
      });

      await mountHierarchy(pinia);
      await capturedOnModelFileChange!(makeFileList(file));
      await flushMicrotasks();

      expect(currentExperiment.sceneObjects).toHaveLength(1);
      const [sceneObject] = currentExperiment.sceneObjects;
      expect(sceneObject!.name).toBe("Brain Model");
      expect(currentExperiment.selectedInspectable).toEqual(sceneObject);
      expect(putSceneModel).toHaveBeenCalledWith(sceneObject!.modelId, file);
    });

    it("notifies and adds nothing when the model file can't be imported", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const currentExperiment = useCurrentExperimentStore(pinia);
      vi.mocked(canLoadModelFile).mockResolvedValue(false);
      const file = new File(["not a model"], "broken.glb", {
        type: "model/gltf-binary"
      });

      const wrapper = await mountHierarchy(pinia);
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await capturedOnModelFileChange!(makeFileList(file));
      await flushMicrotasks();

      expect(currentExperiment.sceneObjects).toEqual([]);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "negative" })
      );
    });

    it("flips visibility and swaps the icon when the eye button is clicked", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const currentExperiment = useCurrentExperimentStore(pinia);
      const sceneObject = makeSceneObject({ visibility: "visible" });
      currentExperiment.experiment.sceneObjects = [sceneObject];

      const wrapper = await mountHierarchy(pinia);
      const visibilityButton = wrapper
        .findAllComponents({ name: "QBtn" })
        .find(
          btn =>
            btn.classes().includes("visibility-button") &&
            btn.element.closest(".scene-object-list")
        )!;
      expect(visibilityButton.props("icon")).toBe("sym_o_visibility");

      await visibilityButton.trigger("click");

      expect(sceneObject.visibility).toBe("hidden");
      expect(visibilityButton.props("icon")).toBe("sym_o_visibility_off");
    });

    it("removes the scene object and clears the selection when the delete button is clicked", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const currentExperiment = useCurrentExperimentStore(pinia);
      const sceneObject = makeSceneObject();
      currentExperiment.experiment.sceneObjects = [sceneObject];
      currentExperiment.selectedInspectable = sceneObject;

      const wrapper = await mountHierarchy(pinia);
      const deleteButton = wrapper
        .findAllComponents({ name: "QBtn" })
        .find(btn => btn.props("icon") === "delete")!;
      await deleteButton.trigger("click");

      expect(currentExperiment.sceneObjects).toEqual([]);
      expect(currentExperiment.selectedInspectable).toBeNull();
    });

    it("reorders scene objects when a row is dragged onto another", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const currentExperiment = useCurrentExperimentStore(pinia);
      const [a, b, c] = [
        makeSceneObject({ name: "A" }),
        makeSceneObject({ name: "B" }),
        makeSceneObject({ name: "C" })
      ];
      currentExperiment.experiment.sceneObjects = [a, b, c];

      const wrapper = await mountHierarchy(pinia);
      const rows = wrapper.findAll(".scene-object-list .q-item");
      await rows[0]!.find(".hierarchy-row__handle").trigger("dragstart");
      await rows[2]!.trigger("dragover");
      await rows[2]!.trigger("drop");

      expect(currentExperiment.experiment.sceneObjects).toEqual([b, c, a]);
    });

    it("carries no drag handle on the camera or axis-guide rows", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = await mountHierarchy(pinia);
      const rows = wrapper.findAll(".scene-list .q-item");

      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.find(".hierarchy-row__handle").exists()).toBe(false);
      }
    });
  });
});
