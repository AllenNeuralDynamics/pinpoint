import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import { flushPromises } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { AbstractEngine } from "@babylonjs/core";
import ProbeInspector from "./ProbeInspector.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import {
  makeProbe,
  makeProbeInterfaceProbe,
  makeSceneModel
} from "@/test/fixtures";
import { getTerminologyRows } from "@/features/atlas";
import { internProbeInterfaceProbe } from "@/features/experiment";
import {
  getProbeContour,
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier
} from "@/features/probe";
import { useProbeSurface, type ProbeSurfaceTargets } from "@/features/slice";
import { canLoadModelFile, putSceneModel } from "@/features/scene";
import { BabylonRuntimeServiceKey } from "@/services/babylon-runtime.service";
import enUS from "@/i18n/en-US";

const t = enUS.probeInspector;
const axis = enUS.axis;
const validation = enUS.validation;

/** Injected Babylon runtime, so `useModelFileImport` can read `engine.value`. */
const babylonRuntimeProvide = {
  [BabylonRuntimeServiceKey as symbol]: {
    engine: { value: {} as AbstractEngine }
  }
};

// `useCurrentExperimentStore`'s `manifest`/`terminologyRows` are
// `computedAsync` and fetch on store creation -- mock the leaf module (not
// the `@/features/atlas` barrel) or mounting triggers real network calls.
// Mirrors the mocking approach in SceneHierarchy.spec.ts.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

// ProbeInspector now renders SliceCanvas, which constructs its sampler
// worker pool eagerly on setup (independent of whether the manifest ever
// resolves) -- mock the composable so mounting doesn't hit the real
// `Worker` global, which happy-dom doesn't provide. Mirrors the mocking
// approach in SliceCanvas.spec.ts.
vi.mock("@/features/slice/composable/useAnnotationSampler", () => ({
  useAnnotationSampler: () => ({
    createStream: () => ({
      result: shallowRef(null),
      isLoading: shallowRef(false)
    }),
    structureIndex: shallowRef(new Map())
  })
}));

// The move-to-surface feature's own composable, mocked so `findTargets` is
// a per-test `vi.fn` -- default cases never invoke it.
vi.mock("@/features/slice/composable/useProbeSurface", () => ({
  useProbeSurface: vi.fn()
}));

// Mock the leaf modules the model-file picker's handler calls, not the
// `@/features/scene` barrel, mirroring `SceneHierarchy.spec.ts`. `scene-model.api`
// keeps its other real exports (`ProbeInspector` imports `buildSceneModel`
// from the same barrel), only `putSceneModel` is a spy.
vi.mock("@/features/scene/api/model-file.api", () => ({
  canLoadModelFile: vi.fn()
}));
vi.mock("@/features/scene/api/scene-model.api", async importOriginal => {
  const actual =
    await importOriginal<
      typeof import("@/features/scene/api/scene-model.api")
    >();
  return {
    ...actual,
    putSceneModel: vi.fn()
  };
});

// `useFileDialog`'s input is never attached to the DOM, so it can't be
// driven through a queryable `<input type="file">`. Replace it with a fake
// that records the registered `onChange` callback and an `open` spy,
// mirroring `SceneHierarchy.spec.ts`.
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

function fieldByLabel(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents({ name: "QInput" })
    .find(field => field.props("label") === label)!;
}

function buttonByLabel(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAll("button")
    .find(button => button.attributes("aria-label") === label)!;
}

/**
 * Focus, replace a field's text, and blur it -- the sequence a real user
 * produces, which `use-field`'s handlers require in this order.
 */
async function editAndBlur(field: VueWrapper, value: string) {
  const native = field.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("focusout");
  await new Promise(resolve => setTimeout(resolve));
}

async function editAndEnter(field: VueWrapper, value: string) {
  const native = field.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("keyup", { key: "Enter" });
}

describe("ProbeInspector", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
    vi.mocked(useProbeSurface).mockReturnValue({ findTargets: vi.fn() });
    openModelFileDialogSpy.mockReset();
    capturedOnModelFileChange = null;
    vi.mocked(canLoadModelFile).mockReset();
    vi.mocked(putSceneModel).mockReset();
  });

  function mountInspector(probe = makeProbe()) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const probeLibrary = useProbeLibraryStore(pinia);
    probeLibrary.add(makeProbeInterfaceProbe());
    const store = useCurrentExperimentStore(pinia);
    store.experiment.probes = [probe];

    const wrapper = mountWithQuasar(ProbeInspector, {
      pinia,
      props: { probe: store.experiment.probes[0]! },
      global: { provide: babylonRuntimeProvide }
    });
    return { wrapper, store, probe: store.experiment.probes[0]! };
  }

  it("groups the inspector into slice, properties, and body model sections", () => {
    const { wrapper } = mountInspector();

    expect(
      wrapper
        .findAllComponents({ name: "QExpansionItem" })
        .map(item => item.props("label"))
    ).toEqual([t.inPlaneSlice, t.properties, t.bodyModel]);
  });

  it("does not mutate the name while typing, before blur or enter", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    const name = fieldByLabel(wrapper, t.name);
    await name.find("input").trigger("focusin");
    await name.find("input").setValue("B");

    expect(probe.name).toBe("A");
  });

  it("commits the name on blur when valid", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    await editAndBlur(fieldByLabel(wrapper, t.name), "B");

    expect(probe.name).toBe("B");
  });

  it("commits the name on Enter when valid", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    await editAndEnter(fieldByLabel(wrapper, t.name), "B");

    expect(probe.name).toBe("B");
  });

  it("rejects a whitespace-only name and leaves the probe's name unchanged", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    const name = fieldByLabel(wrapper, t.name);
    await editAndBlur(name, "   ");

    expect(probe.name).toBe("A");
    expect(name.find("[role='alert']").text()).toBe(validation.nameRequired);
  });

  it("accepts a name already used by another probe in the experiment", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useProbeLibraryStore(pinia).add(makeProbeInterfaceProbe());
    const store = useCurrentExperimentStore(pinia);
    store.experiment.probes = [
      makeProbe({ name: "A" }),
      makeProbe({ name: "B" })
    ];
    const wrapper = mountWithQuasar(ProbeInspector, {
      pinia,
      props: { probe: store.experiment.probes[0]! },
      global: { provide: babylonRuntimeProvide }
    });

    const name = fieldByLabel(wrapper, t.name);
    await editAndBlur(name, "B");

    expect(store.experiment.probes[0]!.name).toBe("B");
    expect(name.find("[role='alert']").exists()).toBe(false);
  });

  it("trims whitespace when committing a name", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    await editAndBlur(fieldByLabel(wrapper, t.name), "  Renamed  ");

    expect(probe.name).toBe("Renamed");
  });

  it("accepts re-committing the probe's own unchanged name", async () => {
    const { wrapper, probe } = mountInspector(makeProbe({ name: "A" }));

    const name = fieldByLabel(wrapper, t.name);
    await editAndBlur(name, "A");

    expect(probe.name).toBe("A");
    expect(name.find("[role='alert']").exists()).toBe(false);
  });

  it("commits AP/DV/ML into tipPosition as real numbers", async () => {
    const { wrapper, probe } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, axis.ap), "-2.5");
    await editAndBlur(fieldByLabel(wrapper, axis.dv), "1");
    await editAndBlur(fieldByLabel(wrapper, axis.ml), "0");

    expect(probe.tipPosition).toEqual([-2.5, 1, 0]);
    expect(probe.tipPosition.every(value => typeof value === "number")).toBe(
      true
    );
  });

  it("commits Roll/Yaw/Pitch in degrees, converting to radians in orientation", async () => {
    const { wrapper, probe } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, t.roll), "90");
    await editAndBlur(fieldByLabel(wrapper, t.yaw), "180");
    await editAndBlur(fieldByLabel(wrapper, t.pitch), "-45");

    expect(probe.rotation[0]).toBeCloseTo(Math.PI / 2);
    expect(probe.rotation[1]).toBeCloseTo(Math.PI);
    expect(probe.rotation[2]).toBeCloseTo(-Math.PI / 4);
  });

  it("rejects a non-numeric value in a numeric field", async () => {
    const { wrapper, probe } = mountInspector();

    const ap = fieldByLabel(wrapper, axis.ap);
    await editAndBlur(ap, "abc");

    expect(probe.tipPosition[0]).toBe(0);
    expect(ap.find("[role='alert']").text()).toBe(validation.mustBeNumber);
  });

  it("rounds the display to the preferences store's decimal precision", async () => {
    const { wrapper } = mountInspector(
      makeProbe({ tipPosition: [1.2345, 0, 0] })
    );
    usePreferencesStore().decimalPrecision = 1;
    await wrapper.vm.$nextTick();

    expect(fieldByLabel(wrapper, axis.ap).props("modelValue")).toBe("1.2");
  });

  it("displays positions and rotations in the preferences store's units", async () => {
    const { wrapper } = mountInspector(
      makeProbe({ tipPosition: [1, 0, 0], rotation: [0, 0, Math.PI / 2] })
    );
    const preferences = usePreferencesStore();
    preferences.positionUnit = "micrometer";
    preferences.rotationUnit = "radian";
    await wrapper.vm.$nextTick();

    const ap = fieldByLabel(wrapper, axis.ap);
    expect(ap.props("modelValue")).toBe("1000.000");
    expect(ap.props("suffix")).toBe("µm");
    const pitch = fieldByLabel(wrapper, t.pitch);
    expect(pitch.props("modelValue")).toBe("1.571");
    expect(pitch.props("suffix")).toBe("rad");
  });

  it("commits zero when a numeric field is left blank", async () => {
    const { wrapper, probe } = mountInspector(
      makeProbe({ tipPosition: [5, 0, 0] })
    );

    const ap = fieldByLabel(wrapper, axis.ap);
    await editAndBlur(ap, "");

    expect(probe.tipPosition[0]).toBe(0);
    expect(ap.find("[role='alert']").exists()).toBe(false);
  });

  it("accepts zero in a numeric field", async () => {
    const { wrapper, probe } = mountInspector(
      makeProbe({ tipPosition: [5, 0, 0] })
    );

    await editAndBlur(fieldByLabel(wrapper, axis.ap), "0");

    expect(probe.tipPosition[0]).toBe(0);
  });

  it("re-seeds every field when the probe prop changes", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useProbeLibraryStore(pinia).add(makeProbeInterfaceProbe());
    const store = useCurrentExperimentStore(pinia);
    const a = makeProbe({ name: "A", tipPosition: [1, 2, 3] });
    const b = makeProbe({ name: "B", tipPosition: [4, 5, 6] });
    store.experiment.probes = [a, b];
    const wrapper = mountWithQuasar(ProbeInspector, {
      pinia,
      props: { probe: a },
      global: { provide: babylonRuntimeProvide }
    });

    // Cast: `setProps`'s generic doesn't narrow to the SFC's declared props.
    await wrapper.setProps({ probe: b } as Record<string, unknown>);

    expect(fieldByLabel(wrapper, t.name).props("modelValue")).toBe("B");
    expect(fieldByLabel(wrapper, axis.ap).props("modelValue")).toBe("4.000");
  });

  it("keeps the renamed probe selected and in sync with the store", async () => {
    // Selection is tracked by id, so a rename must not affect it.
    const { wrapper, store, probe } = mountInspector(makeProbe({ name: "A" }));
    store.selectedInspectable = probe;

    await editAndBlur(fieldByLabel(wrapper, t.name), "B");

    expect(store.isInspectableSelected(probe)).toBe(true);
    expect(store.selectedInspectable?.name).toBe("B");
  });

  describe("probe type select", () => {
    it("shows the library probe's display name, not its raw identifier", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const spec = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "NP1000" }
      });
      useProbeLibraryStore(pinia).add(spec);
      const store = useCurrentExperimentStore(pinia);
      const probe = makeProbe({
        probeInterfaceIdentifier: getProbeInterfaceIdentifier(spec)
      });
      store.experiment.probes = [probe];
      internProbeInterfaceProbe(store.experiment, spec);
      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe },
        global: { provide: babylonRuntimeProvide }
      });

      const select = wrapper.findComponent({ name: "QSelect" });
      expect(select.props("options")).toEqual([
        {
          label: getProbeInterfaceDisplayName(spec),
          value: getProbeInterfaceIdentifier(spec)
        }
      ]);
      expect(select.text()).toContain(getProbeInterfaceDisplayName(spec));
    });

    it("falls back to the raw identifier without throwing when the probe's type isn't in the library", () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useCurrentExperimentStore(pinia);
      const probe = makeProbe({
        probeInterfaceIdentifier: "imec NP1000"
      });
      store.experiment.probes = [probe];

      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe },
        global: { provide: babylonRuntimeProvide }
      });

      expect(wrapper.findComponent({ name: "QSelect" }).text()).toContain(
        "imec NP1000"
      );
    });
  });

  describe("switching probe type", () => {
    it("interns the new definition, repoints the probe, and drops the old definition", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const oldSpec = makeProbeInterfaceProbe();
      const newSpec = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np1" }
      });
      const probeLibrary = useProbeLibraryStore(pinia);
      probeLibrary.add(oldSpec);
      probeLibrary.add(newSpec);
      const store = useCurrentExperimentStore(pinia);
      const probe = makeProbe({
        probeInterfaceIdentifier: getProbeInterfaceIdentifier(oldSpec)
      });
      store.experiment.probes = [probe];
      internProbeInterfaceProbe(store.experiment, oldSpec);
      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe },
        global: { provide: babylonRuntimeProvide }
      });

      wrapper
        .findComponent({ name: "QSelect" })
        .vm.$emit("update:modelValue", getProbeInterfaceIdentifier(newSpec));
      await wrapper.vm.$nextTick();

      expect(probe.probeInterfaceIdentifier).toBe(
        getProbeInterfaceIdentifier(newSpec)
      );
      expect(store.experiment.probeInterfaceProbes).toEqual({
        [getProbeInterfaceIdentifier(newSpec)]: newSpec
      });
    });

    it("does nothing when the selected identifier isn't in the library", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const oldSpec = makeProbeInterfaceProbe();
      useProbeLibraryStore(pinia).add(oldSpec);
      const store = useCurrentExperimentStore(pinia);
      const probe = makeProbe({
        probeInterfaceIdentifier: getProbeInterfaceIdentifier(oldSpec)
      });
      store.experiment.probes = [probe];
      internProbeInterfaceProbe(store.experiment, oldSpec);
      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe },
        global: { provide: babylonRuntimeProvide }
      });

      wrapper
        .findComponent({ name: "QSelect" })
        .vm.$emit("update:modelValue", "unknown manufacturer unknown-model");
      await wrapper.vm.$nextTick();

      expect(probe.probeInterfaceIdentifier).toBe(
        getProbeInterfaceIdentifier(oldSpec)
      );
      expect(store.experiment.probeInterfaceProbes).toEqual({
        [getProbeInterfaceIdentifier(oldSpec)]: oldSpec
      });
    });
  });

  describe("home / copy / lock buttons", () => {
    it("resets the tip position on home click", async () => {
      const { wrapper, probe } = mountInspector(
        makeProbe({ tipPosition: [1, 2, 3] })
      );

      await buttonByLabel(wrapper, t.home).trigger("click");

      expect(probe.tipPosition).toEqual([0, 0, 0]);
    });

    it("duplicates the probe on copy click", async () => {
      const { wrapper, store } = mountInspector(makeProbe({ name: "A" }));

      await buttonByLabel(wrapper, t.copy).trigger("click");

      expect(store.experiment.probes).toHaveLength(2);
      expect(store.experiment.probes[1]!.name).toBe("A - copy");
      expect(store.experiment.probes[1]!.id).not.toBe(
        store.experiment.probes[0]!.id
      );
    });

    it("toggles lock on lock click, swapping the button's label", async () => {
      const { wrapper, probe } = mountInspector();

      await buttonByLabel(wrapper, t.lock).trigger("click");
      expect(probe.lock).toBe(true);
      expect(buttonByLabel(wrapper, t.unlock).exists()).toBe(true);

      await buttonByLabel(wrapper, t.unlock).trigger("click");
      expect(probe.lock).toBe(false);
    });

    it("disables the pose fields and the home/pin buttons while locked, leaving name and copy editable", () => {
      const { wrapper } = mountInspector(makeProbe({ lock: true }));

      for (const label of [axis.ap, axis.dv, axis.ml, t.roll, t.yaw, t.pitch]) {
        expect(fieldByLabel(wrapper, label).props("disable")).toBe(true);
      }
      expect(fieldByLabel(wrapper, t.name).props("disable")).toBeFalsy();
      expect(
        buttonByLabel(wrapper, t.home).attributes("disabled")
      ).toBeDefined();
      expect(
        buttonByLabel(wrapper, t.copy).attributes("disabled")
      ).toBeUndefined();
    });

    it("does not move a locked probe when its disabled home button is clicked", async () => {
      const { wrapper, probe } = mountInspector(
        makeProbe({ lock: true, tipPosition: [1, 2, 3] })
      );

      await buttonByLabel(wrapper, t.home).trigger("click");

      expect(probe.tipPosition).toEqual([1, 2, 3]);
    });
  });

  describe("move to surface", () => {
    it("moves the tip and leaves the choice null on an insideMillimeters result", async () => {
      const findTargets = vi.fn().mockResolvedValue({
        insideMillimeters: [1, 2, 3],
        axisMillimeters: null,
        dorsoventralMillimeters: null
      } satisfies ProbeSurfaceTargets);
      vi.mocked(useProbeSurface).mockReturnValue({ findTargets });
      const { wrapper, store, probe } = mountInspector();

      await buttonByLabel(wrapper, t.surface).trigger("click");
      await flushPromises();

      expect(probe.tipPosition).toEqual([
        1 - store.referenceCoordinate[0],
        2 - store.referenceCoordinate[1],
        3 - store.referenceCoordinate[2]
      ]);
      expect(store.probeSurfaceChoice).toBeNull();
    });

    it("sets the pending choice and leaves the tip unchanged when both targets are available", async () => {
      const findTargets = vi.fn().mockResolvedValue({
        insideMillimeters: null,
        axisMillimeters: [1, 2, 3],
        dorsoventralMillimeters: [4, 5, 6]
      } satisfies ProbeSurfaceTargets);
      vi.mocked(useProbeSurface).mockReturnValue({ findTargets });
      const { wrapper, store, probe } = mountInspector(
        makeProbe({ tipPosition: [7, 8, 9] })
      );

      await buttonByLabel(wrapper, t.surface).trigger("click");
      await flushPromises();

      expect(probe.tipPosition).toEqual([7, 8, 9]);
      expect(store.probeSurfaceChoice).toMatchObject({
        probeId: probe.id,
        axisTargetMillimeters: [1, 2, 3],
        dorsoventralTargetMillimeters: [4, 5, 6]
      });
    });

    it("moves the tip without setting a choice when only one outside-brain target is available", async () => {
      const findTargets = vi.fn().mockResolvedValue({
        insideMillimeters: null,
        axisMillimeters: [1, 2, 3],
        dorsoventralMillimeters: null
      } satisfies ProbeSurfaceTargets);
      vi.mocked(useProbeSurface).mockReturnValue({ findTargets });
      const { wrapper, store, probe } = mountInspector();

      await buttonByLabel(wrapper, t.surface).trigger("click");
      await flushPromises();

      expect(probe.tipPosition).toEqual([
        1 - store.referenceCoordinate[0],
        2 - store.referenceCoordinate[1],
        3 - store.referenceCoordinate[2]
      ]);
      expect(store.probeSurfaceChoice).toBeNull();
    });

    it("shows a no-surface-found warning and leaves the tip unchanged on all-null targets", async () => {
      const findTargets = vi.fn().mockResolvedValue({
        insideMillimeters: null,
        axisMillimeters: null,
        dorsoventralMillimeters: null
      } satisfies ProbeSurfaceTargets);
      vi.mocked(useProbeSurface).mockReturnValue({ findTargets });
      const { wrapper, probe } = mountInspector(
        makeProbe({ tipPosition: [1, 2, 3] })
      );
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await buttonByLabel(wrapper, t.surface).trigger("click");
      await flushPromises();

      expect(notifySpy).toHaveBeenCalledWith({
        message: t.noSurfaceFound,
        caption: t.noSurfaceFoundCaption,
        type: "warning"
      });
      expect(probe.tipPosition).toEqual([1, 2, 3]);
    });

    it("shows a surface-unavailable warning when findTargets resolves null", async () => {
      const findTargets = vi.fn().mockResolvedValue(null);
      vi.mocked(useProbeSurface).mockReturnValue({ findTargets });
      const { wrapper, probe } = mountInspector(
        makeProbe({ tipPosition: [1, 2, 3] })
      );
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await buttonByLabel(wrapper, t.surface).trigger("click");
      await flushPromises();

      expect(notifySpy).toHaveBeenCalledWith({
        message: t.surfaceUnavailable,
        caption: t.surfaceUnavailableCaption,
        type: "warning"
      });
      expect(probe.tipPosition).toEqual([1, 2, 3]);
    });

    it("never shows a toast when cancelled before findTargets resolves", async () => {
      let resolveTargets!: (value: ProbeSurfaceTargets | null) => void;
      const findTargets = vi.fn(
        () =>
          new Promise<ProbeSurfaceTargets | null>(resolve => {
            resolveTargets = resolve;
          })
      );
      vi.mocked(useProbeSurface).mockReturnValue({ findTargets });
      const { wrapper } = mountInspector();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

      await buttonByLabel(wrapper, t.surface).trigger("click");
      await buttonByLabel(wrapper, t.cancelSurface).trigger("click");
      resolveTargets({
        insideMillimeters: null,
        axisMillimeters: null,
        dorsoventralMillimeters: null
      });
      await flushPromises();

      expect(notifySpy).not.toHaveBeenCalled();
    });

    it("shows cancel with a progress bar while sampling, aborting without moving the tip on cancel click", async () => {
      let resolveTargets!: (value: ProbeSurfaceTargets | null) => void;
      let capturedSignal: AbortSignal | undefined;
      const findTargets = vi.fn(
        (
          _probe: unknown,
          _referenceCoordinate: unknown,
          signal?: AbortSignal
        ) => {
          capturedSignal = signal;
          return new Promise<ProbeSurfaceTargets | null>(resolve => {
            resolveTargets = resolve;
          });
        }
      );
      vi.mocked(useProbeSurface).mockReturnValue({ findTargets });
      const { wrapper, probe } = mountInspector(
        makeProbe({ tipPosition: [1, 2, 3] })
      );

      await buttonByLabel(wrapper, t.surface).trigger("click");

      expect(buttonByLabel(wrapper, t.cancelSurface).exists()).toBe(true);
      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        true
      );

      await buttonByLabel(wrapper, t.cancelSurface).trigger("click");

      expect(capturedSignal?.aborted).toBe(true);

      resolveTargets({
        insideMillimeters: [9, 9, 9],
        axisMillimeters: null,
        dorsoventralMillimeters: null
      });
      await flushPromises();

      expect(probe.tipPosition).toEqual([1, 2, 3]);
      expect(buttonByLabel(wrapper, t.surface).exists()).toBe(true);
      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        false
      );
    });

    it("shows cancel for a pending surface choice on this probe, and clears it on click", async () => {
      const { wrapper, store, probe } = mountInspector();
      store.probeSurfaceChoice = {
        probeId: probe.id,
        tipPosition: [...probe.tipPosition],
        rotation: [...probe.rotation],
        tipMillimeters: [0, 0, 0],
        axisTargetMillimeters: [1, 0, 0],
        dorsoventralTargetMillimeters: [0, 1, 0]
      };
      await wrapper.vm.$nextTick();

      expect(buttonByLabel(wrapper, t.cancelSurface).exists()).toBe(true);

      await buttonByLabel(wrapper, t.cancelSurface).trigger("click");

      expect(store.probeSurfaceChoice).toBeNull();
    });

    it("clears a pending surface choice for this probe on unmount", async () => {
      const { wrapper, store, probe } = mountInspector();
      store.probeSurfaceChoice = {
        probeId: probe.id,
        tipPosition: [...probe.tipPosition],
        rotation: [...probe.rotation],
        tipMillimeters: [0, 0, 0],
        axisTargetMillimeters: [1, 0, 0],
        dorsoventralTargetMillimeters: [0, 1, 0]
      };
      await wrapper.vm.$nextTick();

      wrapper.unmount();

      expect(store.probeSurfaceChoice).toBeNull();
    });
  });

  describe("shank alignment", () => {
    /** A 0.07mm x 10mm single-shank contour. */
    const SINGLE_SHANK_CONTOUR = [
      [-0.035, 0],
      [0.035, 0],
      [0.035, 10],
      [-0.035, 10]
    ];

    /** Two 0.1mm shanks 1.8mm apart, joined along a top edge at y = 10mm - mirrors shank.spec.ts. */
    const TWO_SHANK_CONTOUR = [
      [-1, 10],
      [-1, 0],
      [-0.9, 0],
      [-0.9, 10],
      [0.9, 10],
      [0.9, 0],
      [1, 0],
      [1, 10]
    ];

    /** Resolve `{index}` in the `alignShank` message the way vue-i18n would. */
    function alignShankLabel(index: number): string {
      return t.alignShank.replace("{index}", String(index));
    }

    function mountSingleShank() {
      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useCurrentExperimentStore(pinia);
      const probeInterfaceProbe = makeProbeInterfaceProbe({
        si_units: "mm",
        probe_planar_contour: SINGLE_SHANK_CONTOUR,
        contact_positions: [[0, 1]],
        contact_shapes: ["square"],
        contact_shape_params: [{ width: 0.02 }]
      });
      internProbeInterfaceProbe(store.experiment, probeInterfaceProbe);
      const probe = makeProbe({
        probeInterfaceIdentifier:
          getProbeInterfaceIdentifier(probeInterfaceProbe)
      });
      store.experiment.probes = [probe];

      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe: store.experiment.probes[0]! },
        global: { provide: babylonRuntimeProvide }
      });
      return { wrapper, probe: store.experiment.probes[0]! };
    }

    function mountTwoShanks() {
      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useCurrentExperimentStore(pinia);
      const probeInterfaceProbe = makeProbeInterfaceProbe({
        si_units: "mm",
        probe_planar_contour: TWO_SHANK_CONTOUR,
        contact_positions: [
          [-0.95, 1],
          [0.95, 1]
        ],
        shank_ids: ["0", "1"],
        contact_shapes: ["square", "square"],
        contact_shape_params: [{ width: 0.02 }, { width: 0.02 }]
      });
      internProbeInterfaceProbe(store.experiment, probeInterfaceProbe);
      const probe = makeProbe({
        probeInterfaceIdentifier:
          getProbeInterfaceIdentifier(probeInterfaceProbe)
      });
      store.experiment.probes = [probe];

      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe: store.experiment.probes[0]! },
        global: { provide: babylonRuntimeProvide }
      });
      return { wrapper, probe: store.experiment.probes[0]! };
    }

    it("renders no alignment toggle or label for a single-shank definition", () => {
      const { wrapper } = mountSingleShank();

      expect(wrapper.findComponent({ name: "QBtnToggle" }).exists()).toBe(
        false
      );
      expect(
        wrapper
          .findAll("button")
          .some(button => button.attributes("aria-label") === t.alignCenter)
      ).toBe(false);
      expect(wrapper.text()).not.toContain(t.centeredShankIndex);
    });

    it("renders one button per shank plus a center option for a two-shank definition, and selecting a shank writes its index", async () => {
      const { wrapper, probe } = mountTwoShanks();

      expect(buttonByLabel(wrapper, alignShankLabel(0)).exists()).toBe(true);
      expect(buttonByLabel(wrapper, alignShankLabel(1)).exists()).toBe(true);
      expect(buttonByLabel(wrapper, t.alignCenter).exists()).toBe(true);

      await buttonByLabel(wrapper, alignShankLabel(1)).trigger("click");

      expect(probe.shankAlignmentIndex).toBe(1);
    });

    it("orders the options shank 0, center, shank 1", () => {
      const { wrapper } = mountTwoShanks();

      const toggle = wrapper.findComponent({ name: "QBtnToggle" });
      expect(
        (toggle.props("options") as { label: string }[]).map(
          option => option.label
        )
      ).toEqual(["0", t.alignCenterLabel, "1"]);
    });
  });

  describe("body model", () => {
    /** Resolve `{axis}` in a body-model input label the way vue-i18n would. */
    function bodyModelLabel(key: keyof typeof t, axisLabel: string): string {
      return (t[key] as string).replace("{axis}", axisLabel);
    }

    it("stores a valid picked file and points the probe's body model at it", async () => {
      vi.mocked(canLoadModelFile).mockResolvedValue(true);
      const { probe } = mountInspector();
      const file = new File([new Uint8Array([1, 2, 3])], "Body.glb", {
        type: "model/gltf-binary"
      });

      await capturedOnModelFileChange!(makeFileList(file));
      await flushPromises();

      expect(probe.bodyModel).not.toBeNull();
      expect(putSceneModel).toHaveBeenCalledWith(
        probe.bodyModel!.modelId,
        file
      );
    });

    it("places a freshly uploaded body model at the base of the probe's shanks", async () => {
      vi.mocked(canLoadModelFile).mockResolvedValue(true);
      const pinia = createPinia();
      setActivePinia(pinia);
      useProbeLibraryStore(pinia).add(makeProbeInterfaceProbe());
      const store = useCurrentExperimentStore(pinia);
      const probeInterfaceProbe = makeProbeInterfaceProbe({
        si_units: "mm",
        probe_planar_contour: [
          [-0.035, 0],
          [0.035, 0],
          [0.035, 10],
          [-0.035, 10]
        ],
        contact_positions: [[0, 1]],
        contact_shapes: ["square"],
        contact_shape_params: [{ width: 0.02 }]
      });
      internProbeInterfaceProbe(store.experiment, probeInterfaceProbe);
      const probe = makeProbe({
        probeInterfaceIdentifier:
          getProbeInterfaceIdentifier(probeInterfaceProbe)
      });
      store.experiment.probes = [probe];
      mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe: store.experiment.probes[0]! },
        global: { provide: babylonRuntimeProvide }
      });
      const file = new File([new Uint8Array([1, 2, 3])], "Body.glb", {
        type: "model/gltf-binary"
      });

      await capturedOnModelFileChange!(makeFileList(file));
      await flushPromises();

      const contour = getProbeContour(probeInterfaceProbe)!;
      expect(probe.bodyModel!.position).toEqual([
        0,
        0,
        contour.heightMillimeters
      ]);
    });

    it("clears the probe's body model when the remove button is clicked", async () => {
      const { wrapper, probe } = mountInspector(
        makeProbe({ bodyModel: makeSceneModel() })
      );

      await buttonByLabel(wrapper, t.removeBodyModel).trigger("click");

      expect(probe.bodyModel).toBeNull();
    });

    it("hides the nine pose inputs when no body model is attached", () => {
      const { wrapper } = mountInspector(makeProbe({ bodyModel: null }));

      expect(
        fieldByLabel(wrapper, bodyModelLabel("bodyModelPosition", axis.x))
      ).toBeUndefined();
    });

    it("writes Position X, Rotation Y, and Scale Z back to the body model, respecting unit preferences", async () => {
      const { wrapper, probe } = mountInspector(
        makeProbe({ bodyModel: makeSceneModel() })
      );
      const preferences = usePreferencesStore();
      preferences.positionUnit = "millimeter";
      preferences.rotationUnit = "degree";
      await wrapper.vm.$nextTick();

      await editAndBlur(
        fieldByLabel(wrapper, bodyModelLabel("bodyModelPosition", axis.x)),
        "5"
      );
      await editAndBlur(
        fieldByLabel(wrapper, bodyModelLabel("bodyModelRotation", axis.y)),
        "90"
      );
      await editAndBlur(
        fieldByLabel(wrapper, bodyModelLabel("bodyModelScale", axis.z)),
        "2"
      );

      expect(probe.bodyModel!.position[0]).toBe(5);
      expect(probe.bodyModel!.rotation[1]).toBeCloseTo(Math.PI / 2);
      expect(probe.bodyModel!.scale[2]).toBe(2);
    });

    it("disables the nine pose inputs while the probe is locked", () => {
      const { wrapper } = mountInspector(
        makeProbe({ bodyModel: makeSceneModel(), lock: true })
      );

      expect(
        fieldByLabel(
          wrapper,
          bodyModelLabel("bodyModelPosition", axis.x)
        ).props("disable")
      ).toBe(true);
    });

    it("toggles the gizmo attachment on the probe's body model", async () => {
      const { wrapper, store, probe } = mountInspector(
        makeProbe({ bodyModel: makeSceneModel() })
      );

      await buttonByLabel(wrapper, t.attachBodyModelGizmo).trigger("click");
      expect(store.bodyModelGizmoProbeId).toBe(probe.id);
      expect(buttonByLabel(wrapper, t.detachBodyModelGizmo).exists()).toBe(
        true
      );

      await buttonByLabel(wrapper, t.detachBodyModelGizmo).trigger("click");
      expect(store.bodyModelGizmoProbeId).toBeNull();
      expect(buttonByLabel(wrapper, t.attachBodyModelGizmo).exists()).toBe(
        true
      );
    });

    it("disables the gizmo attach button while the probe is locked", () => {
      const { wrapper } = mountInspector(
        makeProbe({ bodyModel: makeSceneModel(), lock: true })
      );

      expect(
        buttonByLabel(wrapper, t.attachBodyModelGizmo).attributes("disabled")
      ).toBeDefined();
    });
  });
});
