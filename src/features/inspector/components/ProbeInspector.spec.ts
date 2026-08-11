import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowRef, toRaw } from "vue";
import { flushPromises } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import type { AbstractEngine } from "@babylonjs/core";
import ProbeInspector from "./ProbeInspector.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import { useCoordinateSystemLibraryStore } from "@/stores/coordinate-system-library.store";
import {
  makeCoordinateSystem,
  makeProbe,
  makeProbeInterfaceProbe,
  makeSceneModel
} from "@/test/fixtures";
import {
  buildCoordinateSystem,
  buildCoordinateSystemNode,
  buildCoordinateSystemValue,
  buildFixedCoordinateSystemValue,
  type CoordinateSystemSolution,
  isCoordinateSystemSolutionAtPose,
  SETTLED_SOLVE_STARTS,
  solveCoordinateSystemChain,
  solveCoordinateSystemChainInverse
} from "@/features/coordinate-system";
import type { InverseKinematicsSolveRequest } from "@/features/coordinate-system";
import { getTerminologyRows } from "@/features/atlas";
import {
  ALLEN_MOUSE_REFERENCE_COORDINATE,
  internProbeInterfaceProbe,
  setProbeCoordinateSystem
} from "@/features/experiment";
import {
  getProbeContour,
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier,
  type Probe
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

// The solver's status for a given pose is emergent, so the reporting-policy tests
// script it. Defaults to the real implementation so every other IK test here still
// exercises a genuine solve.
vi.mock(
  "@/features/coordinate-system/api/inverse-kinematics.api",
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import("@/features/coordinate-system/api/inverse-kinematics.api")
      >();
    return {
      ...actual,
      solveCoordinateSystemChainInverse: vi.fn(
        actual.solveCoordinateSystemChainInverse
      )
    };
  }
);

// The solve now runs in a worker, and happy-dom provides no `Worker`. Route the composable
// through the same two calls the worker's handler makes -- cloning the request the way
// `postMessage` would -- so every test below still exercises a genuine solve and the
// `inverse-kinematics.api` mock above still scripts its status.
vi.mock(
  "@/features/coordinate-system/composable/useInverseKinematicsSolver",
  () => ({
    useInverseKinematicsSolver: () => ({
      solve: (request: InverseKinematicsSolveRequest) => {
        const { chain, target, referenceOffsetMillimeters, maximumStarts } =
          structuredClone(request);
        const status = solveCoordinateSystemChainInverse(
          chain,
          target,
          referenceOffsetMillimeters,
          maximumStarts
        );
        const solution = solveCoordinateSystemChain(
          chain,
          referenceOffsetMillimeters
        );
        return Promise.resolve({ status, chain, solution });
      }
    })
  })
);

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

/** `findTargets` resolving an entry point: the probe's shank crosses the brain. */
function findTargetsCrossingBrain(
  insideMillimeters: [number, number, number] = [1, 2, 3]
) {
  return vi.fn().mockResolvedValue({
    insideMillimeters,
    axisMillimeters: null,
    dorsoventralMillimeters: null
  } satisfies ProbeSurfaceTargets);
}

/** `findTargets` resolving no entry point: the probe's shank misses the brain. */
function findTargetsMissingBrain() {
  return vi.fn().mockResolvedValue({
    insideMillimeters: null,
    axisMillimeters: [1, 2, 3],
    dorsoventralMillimeters: null
  } satisfies ProbeSurfaceTargets);
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

function selectByLabel(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents({ name: "QSelect" })
    .find(select => select.props("label") === label)!;
}

function fieldByAriaLabel(wrapper: VueWrapper, ariaLabel: string) {
  return wrapper
    .findAllComponents({ name: "QInput" })
    .find(field => field.find("input").attributes("aria-label") === ariaLabel)!;
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
    vi.mocked(solveCoordinateSystemChainInverse).mockReset();
    vi.mocked(useProbeSurface).mockReturnValue({
      findTargets: vi.fn(),
      isOnSurface: vi.fn()
    });
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
    return { wrapper, store, probe: store.experiment.probes[0]!, pinia };
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

  it("rejects a non-numeric value in a numeric field", async () => {
    const { wrapper } = mountInspector();

    const field = fieldByLabel(wrapper, axis.ml);
    await editAndBlur(field, "abc");

    expect(field.find("[role='alert']").text()).toBe(validation.mustBeNumber);

    // "abc" must never reach the stored value: forcing a precision change
    // re-syncs the field from the canonical value, which only shows a
    // freshly formatted zero-tip-relative-to-reference value if the invalid
    // entry was never committed.
    usePreferencesStore().decimalPrecision = 1;
    await wrapper.vm.$nextTick();
    expect(fieldByLabel(wrapper, axis.ml).props("modelValue")).toBe(
      (0 - ALLEN_MOUSE_REFERENCE_COORDINATE[2]).toFixed(1)
    );
  });

  it("rounds the display to the preferences store's decimal precision", async () => {
    const { wrapper } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, axis.ml), "1.2345");
    usePreferencesStore().decimalPrecision = 1;
    await wrapper.vm.$nextTick();

    expect(fieldByLabel(wrapper, axis.ml).props("modelValue")).toBe("1.2");
  });

  it("displays positions and rotations in the preferences store's units", async () => {
    const { wrapper } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, axis.ml), "1");
    const preferences = usePreferencesStore();
    preferences.positionUnit = "micrometer";
    preferences.rotationUnit = "radian";
    await wrapper.vm.$nextTick();

    const mlField = fieldByLabel(wrapper, axis.ml);
    expect(mlField.props("modelValue")).toBe("1000.000");
    expect(mlField.props("suffix")).toBe("µm");
    expect(fieldByLabel(wrapper, axis.roll).props("suffix")).toBe("rad");
  });

  it("commits zero when a numeric field is left blank", async () => {
    const { wrapper } = mountInspector();
    const field = fieldByLabel(wrapper, axis.ml);

    await editAndBlur(field, "5");
    await editAndBlur(field, "");

    expect(field.props("modelValue")).toBe("0.000");
    expect(field.find("[role='alert']").exists()).toBe(false);
  });

  it("accepts zero in a numeric field", async () => {
    const { wrapper } = mountInspector();
    const field = fieldByLabel(wrapper, axis.ml);

    await editAndBlur(field, "5");
    await editAndBlur(field, "0");

    expect(field.props("modelValue")).toBe("0.000");
  });

  it("re-seeds every field when the probe prop changes", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useProbeLibraryStore(pinia).add(makeProbeInterfaceProbe());
    const store = useCurrentExperimentStore(pinia);
    const a = makeProbe({ name: "A" });
    const b = makeProbe({ name: "B" });
    store.experiment.probes = [a, b];
    const wrapper = mountWithQuasar(ProbeInspector, {
      pinia,
      props: { probe: a },
      global: { provide: babylonRuntimeProvide }
    });

    await editAndBlur(fieldByLabel(wrapper, axis.ml), "1");
    // Cast: `setProps`'s generic doesn't narrow to the SFC's declared props.
    await wrapper.setProps({ probe: b } as Record<string, unknown>);

    expect(fieldByLabel(wrapper, t.name).props("modelValue")).toBe("B");
    expect(fieldByLabel(wrapper, axis.ml).props("modelValue")).toBe(
      (0 - ALLEN_MOUSE_REFERENCE_COORDINATE[2]).toFixed(3)
    );
  });

  it("keeps the renamed probe selected and in sync with the store", async () => {
    // Selection is tracked by id, so a rename must not affect it.
    const { wrapper, store, probe } = mountInspector(makeProbe({ name: "A" }));
    store.selectedInspectable = probe;

    await editAndBlur(fieldByLabel(wrapper, t.name), "B");

    expect(store.isInspectableSelected(probe)).toBe(true);
    expect(store.selectedInspectable?.name).toBe("B");
  });

  describe("coordinate system transform chain", () => {
    it("renders one transform group per node of the selected coordinate system", async () => {
      const { wrapper, pinia } = mountInspector();
      const store = useCoordinateSystemLibraryStore(pinia);
      const surfaceAndDepth = store.library[0]!;

      expect(
        wrapper.findAll(".text-body2.text-weight-bold").map(node => node.text())
      ).toEqual([]);

      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        surfaceAndDepth.id
      );
      await wrapper.vm.$nextTick();

      expect(
        wrapper.findAll(".text-body2.text-weight-bold").map(node => node.text())
      ).toEqual(surfaceAndDepth.chain.map(node => node.name));
    });

    it("writes the probe's coordinateSystemIdentifier and interns the picked definition", async () => {
      const { wrapper, store, probe, pinia } = mountInspector();
      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;

      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        surfaceAndDepth.id
      );
      await wrapper.vm.$nextTick();

      expect(probe.coordinateSystemIdentifier).toBe(surfaceAndDepth.id);
      expect(store.experiment.coordinateSystems[surfaceAndDepth.id]).toEqual(
        surfaceAndDepth
      );
    });

    it("restores the previously selected coordinate system after unmounting and remounting", async () => {
      const { wrapper, probe, pinia } = mountInspector();
      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;

      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        surfaceAndDepth.id
      );
      await wrapper.vm.$nextTick();
      wrapper.unmount();

      const remounted = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe },
        global: { provide: babylonRuntimeProvide }
      });

      expect(
        remounted
          .findAll(".text-body2.text-weight-bold")
          .map(node => node.text())
      ).toEqual(surfaceAndDepth.chain.map(node => node.name));
    });

    it("hides a node's rotation row when every rotation value is fixed", async () => {
      const { wrapper, pinia } = mountInspector();
      const store = useCoordinateSystemLibraryStore(pinia);
      const surfaceAndDepth = store.library[0]!;
      const depthNodeName = surfaceAndDepth.chain[1]!.name;
      const depthValueName = surfaceAndDepth.chain[1]!.position.find(
        ({ mode }) => mode !== "fixed"
      )!.name;

      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        surfaceAndDepth.id
      );
      await wrapper.vm.$nextTick();

      expect(
        fieldByAriaLabel(
          wrapper,
          t.transformValue
            .replace("{transform}", depthNodeName)
            .replace("{name}", depthValueName)
        ).exists()
      ).toBe(true);
      expect(
        wrapper
          .findComponent({ name: "ProbeTransformChain" })
          .findAllComponents({ name: "QInput" })
      ).toHaveLength(7);
    });

    it("omits a fixed value instead of showing it as a disabled input", async () => {
      const { wrapper, pinia } = mountInspector();
      const store = useCoordinateSystemLibraryStore(pinia);
      const surfaceAndDepth = store.library[0]!;
      const depthNodeName = surfaceAndDepth.chain[1]!.name;

      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        surfaceAndDepth.id
      );
      await wrapper.vm.$nextTick();

      const ariaLabels = wrapper
        .findAllComponents({ name: "QInput" })
        .map(field => field.find("input").attributes("aria-label"));
      expect(ariaLabels).not.toContain(
        t.transformValue
          .replace("{transform}", depthNodeName)
          .replace("{name}", axis.x)
      );
      expect(ariaLabels).not.toContain(
        t.transformValue
          .replace("{transform}", depthNodeName)
          .replace("{name}", axis.z)
      );
      expect(fieldByLabel(wrapper, "Depth").props("disable")).toBeFalsy();
    });

    it("shows a user-constrained value as an editable input", async () => {
      const { wrapper, pinia } = mountInspector();
      const store = useCoordinateSystemLibraryStore(pinia);
      const surfaceAndDepth = store.library[0]!;
      const depthPosition = surfaceAndDepth.chain[1]!.position;
      depthPosition[0]!.mode = "user";
      depthPosition[0]!.name = "Insertion";

      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        surfaceAndDepth.id
      );
      await wrapper.vm.$nextTick();

      const field = fieldByLabel(wrapper, "Insertion");
      expect(field.exists()).toBe(true);
      expect(field.props("disable")).toBeFalsy();
    });

    it("omits a node whose every value is fixed", async () => {
      const { wrapper, pinia } = mountInspector();
      const store = useCoordinateSystemLibraryStore(pinia);
      const allFixedNode = buildCoordinateSystemNode(
        "Fixed",
        [
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue()
        ],
        [
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue()
        ]
      );
      const adjustableNode = buildCoordinateSystemNode(
        "Adjustable",
        [
          buildCoordinateSystemValue("X"),
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue()
        ],
        [
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue()
        ]
      );
      const custom = buildCoordinateSystem("Custom", [
        allFixedNode,
        adjustableNode
      ]);
      store.library.push(custom);

      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        custom.id
      );
      await wrapper.vm.$nextTick();

      expect(
        wrapper.findAll(".text-body2.text-weight-bold").map(node => node.text())
      ).toEqual(["Adjustable"]);
    });

    it("shows the probe's current tip and rotation, local to the reference coordinate", () => {
      const { wrapper } = mountInspector(
        makeProbe({
          tipPosition: [7, 8, 9],
          rotation: [Math.PI / 2, Math.PI, Math.PI / 4]
        })
      );
      const [apRef, dvRef, mlRef] = ALLEN_MOUSE_REFERENCE_COORDINATE;

      expect(fieldByLabel(wrapper, axis.ap).props("modelValue")).toBe(
        (7 - apRef).toFixed(3)
      );
      expect(fieldByLabel(wrapper, axis.dv).props("modelValue")).toBe(
        (8 - dvRef).toFixed(3)
      );
      expect(fieldByLabel(wrapper, axis.ml).props("modelValue")).toBe(
        (9 - mlRef).toFixed(3)
      );
      expect(fieldByLabel(wrapper, axis.roll).props("modelValue")).toBe(
        "90.000"
      );
      expect(fieldByLabel(wrapper, axis.yaw).props("modelValue")).toBe(
        "180.000"
      );
      expect(fieldByLabel(wrapper, axis.pitch).props("modelValue")).toBe(
        "45.000"
      );
    });

    it("mirrors an external probe pose change into the default node's fields, local to the reference coordinate", async () => {
      const { wrapper, probe } = mountInspector(
        makeProbe({ tipPosition: [0, 0, 0] })
      );
      const [apRef, dvRef, mlRef] = ALLEN_MOUSE_REFERENCE_COORDINATE;

      probe.tipPosition = [1, 2, 3];
      await wrapper.vm.$nextTick();

      expect(fieldByLabel(wrapper, axis.ap).props("modelValue")).toBe(
        (1 - apRef).toFixed(3)
      );
      expect(fieldByLabel(wrapper, axis.dv).props("modelValue")).toBe(
        (2 - dvRef).toFixed(3)
      );
      expect(fieldByLabel(wrapper, axis.ml).props("modelValue")).toBe(
        (3 - mlRef).toFixed(3)
      );
    });

    it("tracks a gizmo drag frame by frame, only committing history on release", async () => {
      const { wrapper, store, probe } = mountInspector(
        makeProbe({ tipPosition: [0, 0, 0] })
      );
      const [apRef] = ALLEN_MOUSE_REFERENCE_COORDINATE;
      const preDragTip = [...probe.tipPosition];
      // Mounting seeds the probe into the store, which commits its own history
      // point; reset that baseline so only the drag's history is under test.
      store.resetHistory();

      store.draggedProbeId = probe.id;
      probe.tipPosition = [1, 0, 0];
      await wrapper.vm.$nextTick();
      probe.tipPosition = [2, 0, 0];
      await wrapper.vm.$nextTick();

      expect(store.canUndo).toBe(false);
      expect(fieldByLabel(wrapper, axis.ap).props("modelValue")).toBe(
        (2 - apRef).toFixed(3)
      );

      store.endProbeDrag();
      expect(store.canUndo).toBe(true);
      store.undo();
      expect(store.probes[0]!.tipPosition).toEqual(preDragTip);
    });

    it("does not renormalize rotation on commit, matching the old six-input system", async () => {
      const { wrapper, probe } = mountInspector(
        makeProbe({
          tipPosition: [7, 8, 9],
          rotation: [0, (3 * Math.PI) / 2, 0]
        })
      );
      const [, , mlRef] = ALLEN_MOUSE_REFERENCE_COORDINATE;

      await editAndBlur(fieldByLabel(wrapper, axis.ml), "20");

      expect(probe.tipPosition).toEqual([7, 8, 20 + mlRef]);
      expect(probe.rotation).toEqual([0, (3 * Math.PI) / 2, 0]);
    });

    it("drags the ML field to move the probe live through the same commit path as typing", async () => {
      const { wrapper, probe } = mountInspector(
        makeProbe({ tipPosition: [7, 8, 9] })
      );
      await wrapper.vm.$nextTick();
      const field = fieldByLabel(wrapper, axis.ml);
      const before = Number(field.props("modelValue"));
      const tipBeforeDrag = [...probe.tipPosition];

      await field.trigger("pointerdown", {
        clientX: 0,
        pointerId: 1,
        button: 0
      });
      await field.trigger("pointermove", { clientX: 40, pointerId: 1 });

      expect(field.props("modelValue")).toBe((before + 0.4).toFixed(3));
      expect(probe.tipPosition).not.toEqual(tipBeforeDrag);
    });

    it("commits the ML field to the probe's tip, leaving AP and DV alone", async () => {
      const { wrapper, probe } = mountInspector(
        makeProbe({ tipPosition: [7, 8, 9] })
      );
      const [, , mlRef] = ALLEN_MOUSE_REFERENCE_COORDINATE;

      await editAndBlur(fieldByLabel(wrapper, axis.ml), "20");

      expect(probe.tipPosition).toEqual([7, 8, 20 + mlRef]);
    });

    it("does not move the probe when switching to a multi-node coordinate system", async () => {
      const { wrapper, probe, pinia } = mountInspector(
        makeProbe({ tipPosition: [7, 8, 9], rotation: [0.1, 0.2, 0.3] })
      );
      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;

      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        surfaceAndDepth.id
      );
      await wrapper.vm.$nextTick();

      expect(probe.tipPosition).toEqual([7, 8, 9]);
      expect(probe.rotation).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe("inverse kinematics", () => {
    /**
     * Solve a chain matching the multi-node library system's structure, seeded from what the
     * inspector currently renders for it.
     * @param wrapper Mounted inspector to read rendered fields from.
     * @param pinia Active pinia instance, to resolve the library and reference offset.
     */
    function solveDisplayedChain(
      wrapper: VueWrapper,
      pinia: Pinia
    ): CoordinateSystemSolution {
      const chain = structuredClone(
        toRaw(useCoordinateSystemLibraryStore(pinia).library[0]!)
      ).chain;
      for (const node of chain) {
        for (const value of [...node.position, ...node.rotation]) {
          if (value.mode !== "free") continue;
          value.value = Number(
            fieldByLabel(wrapper, value.name).props("modelValue")
          );
        }
      }
      const referenceOffset =
        useCurrentExperimentStore(pinia).referenceCoordinate;
      return solveCoordinateSystemChain(chain, referenceOffset);
    }

    /**
     * Select the multi-node "Surface Coordinate & Depth" library system, in radians and at
     * high precision so its rendered values round-trip cleanly, and let its initial solve settle.
     * @param pinia Active pinia instance, to resolve the library.
     */
    async function selectMultiNodeSystem(
      wrapper: VueWrapper,
      pinia: Pinia
    ): Promise<void> {
      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;
      usePreferencesStore().rotationUnit = "radian";
      usePreferencesStore().decimalPrecision = 6;
      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        surfaceAndDepth.id
      );
      await wrapper.vm.$nextTick();
      await flushPromises();
    }

    it("runs no solve and shows no toast when Default is selected", async () => {
      const { wrapper } = mountInspector();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await flushPromises();

      expect(
        vi.mocked(solveCoordinateSystemChainInverse)
      ).not.toHaveBeenCalled();
      expect(notifySpy).not.toHaveBeenCalled();
    });

    it("solves a drag frame against the pose its surface sample was taken from", async () => {
      let reactiveProbe: Probe | null = null;
      let activePinia: Pinia | null = null;
      let sampledTip: [number, number, number] = [0, 0, 0];
      // The mutation fires once: it simulates a single drag frame landing while the first
      // sampling is in flight, not a fresh drag frame on every subsequent march.
      let hasLanded = false;
      const findTargets = vi.fn(async () => {
        if (!hasLanded) {
          hasLanded = true;
          sampledTip = [...reactiveProbe!.tipPosition];
          // A drag frame landing while this sampling is in flight.
          useCurrentExperimentStore(activePinia!).draggedProbeId =
            reactiveProbe!.id;
          reactiveProbe!.tipPosition = [9, 9, 9];
        }
        return {
          insideMillimeters: [1, 2, 3],
          axisMillimeters: null,
          dorsoventralMillimeters: null
        } satisfies ProbeSurfaceTargets;
      });
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface: vi.fn().mockResolvedValue(true)
      });
      const mounted = mountInspector();
      reactiveProbe = mounted.probe;
      activePinia = mounted.pinia;

      await selectMultiNodeSystem(mounted.wrapper, mounted.pinia);

      expect(reactiveProbe.tipPosition).toEqual([9, 9, 9]);
      expect(
        vi.mocked(solveCoordinateSystemChainInverse).mock.calls[0]![1]
          .tipPosition
      ).toEqual(sampledTip);
    });

    it("pins the surface node to the marched entry point with the tip pushed past it, and draws no ghost", async () => {
      const findTargets = vi.fn().mockResolvedValue(null);
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface: vi.fn().mockResolvedValue(true)
      });
      const { wrapper, pinia, store, probe } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);
      // No entry point yet, so nothing is pinned and nothing is marked.
      expect(store.probeSurfaceMarker).toBeNull();

      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;
      const depthValueName = surfaceAndDepth.chain[1]!.position.find(
        ({ mode }) => mode !== "fixed"
      )!.name;
      await editAndBlur(fieldByLabel(wrapper, depthValueName), "5");
      await flushPromises();

      // This chain always solves its surface node onto the probe's axis, 5 mm up the shank, so its
      // current position is the kind of point the entry-point march returns.
      const entryPoint = solveDisplayedChain(wrapper, pinia).nodePositions[0]!;
      findTargets.mockResolvedValue({
        insideMillimeters: entryPoint,
        axisMillimeters: null,
        dorsoventralMillimeters: null
      } satisfies ProbeSurfaceTargets);
      // Drive the tip 10 mm further along the shank, past the entry point's far side: the old
      // in-brain gate dropped the goal here, while the entry point above the tip stays reachable.
      probe.tipPosition = probe.tipPosition.map(
        (value, index) => 3 * value - 2 * entryPoint[index]!
      ) as [number, number, number];
      await flushPromises();

      expect(
        vi.mocked(solveCoordinateSystemChainInverse).mock.calls.at(-1)![1]
          .surfacePosition
      ).toEqual(entryPoint);
      expect(store.probeGhost).toBeNull();
      expect(store.probeSurfaceMarker?.probeId).toBe(probe.id);
      store.probeSurfaceMarker!.position.forEach((value, index) => {
        expect(value).toBeCloseTo(entryPoint[index]!, 3);
      });
    });

    it("warns immediately on a one-shot solve when the probe crosses the brain", async () => {
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsCrossingBrain(),
        isOnSurface: vi.fn().mockResolvedValue(false)
      });
      const { wrapper, pinia } = mountInspector();

      await selectMultiNodeSystem(wrapper, pinia);

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(1);
    });

    it("shows no warning when isOnSurface resolves null", async () => {
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsCrossingBrain(),
        isOnSurface: vi.fn().mockResolvedValue(null)
      });
      const { wrapper, pinia } = mountInspector();

      await selectMultiNodeSystem(wrapper, pinia);

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(0);
    });

    it("never verifies the surface when the probe misses the brain", async () => {
      const isOnSurface = vi.fn().mockResolvedValue(false);
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsMissingBrain(),
        isOnSurface
      });
      const { wrapper, store, pinia, probe } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);

      store.draggedProbeId = probe.id;
      probe.rotation = [0, 0, 0.1];
      await flushPromises();
      probe.rotation = [0, 0, 0.2];
      await flushPromises();
      probe.rotation = [0, 0, 0.3];
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(0);
      expect(isOnSurface).not.toHaveBeenCalled();
    });

    it("debounces a preview warning across drag frames", async () => {
      let onSurface: boolean | null = true;
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsCrossingBrain(),
        isOnSurface: vi.fn(async () => onSurface)
      });
      const { wrapper, store, pinia, probe } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);

      onSurface = false;
      store.draggedProbeId = probe.id;
      probe.rotation = [0, 0, 0.1];
      await flushPromises();
      probe.rotation = [0, 0, 0.2];
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(0);

      probe.rotation = [0, 0, 0.3];
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(1);
    });

    it("re-verifies on a commit while the probe crosses the brain, keeping the warning", async () => {
      const isOnSurface = vi.fn().mockResolvedValue(false);
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsCrossingBrain(),
        isOnSurface
      });
      const { wrapper, pinia } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(1);
      const callCountBeforeCommit = isOnSurface.mock.calls.length;

      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;
      const depthValueName = surfaceAndDepth.chain[1]!.position.find(
        ({ mode }) => mode !== "fixed"
      )!.name;
      await editAndBlur(fieldByLabel(wrapper, depthValueName), "5");
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(1);
      expect(isOnSurface.mock.calls.length).toBeGreaterThan(
        callCountBeforeCommit
      );
    });

    it("clears the warning on a commit once the probe stops crossing the brain, without sampling", async () => {
      const findTargets = findTargetsCrossingBrain();
      const isOnSurface = vi.fn().mockResolvedValue(false);
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface
      });
      const { wrapper, pinia } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(1);
      const callCountBeforeCommit = isOnSurface.mock.calls.length;

      findTargets.mockResolvedValue({
        insideMillimeters: null,
        axisMillimeters: [1, 2, 3],
        dorsoventralMillimeters: null
      });
      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;
      const depthValueName = surfaceAndDepth.chain[1]!.position.find(
        ({ mode }) => mode !== "fixed"
      )!.name;
      await editAndBlur(fieldByLabel(wrapper, depthValueName), "5");
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(0);
      expect(isOnSurface).toHaveBeenCalledTimes(callCountBeforeCommit);
    });

    it("reproduces an external pose change in the chain's inputs and leaves the ghost null", async () => {
      const { wrapper, pinia, probe } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);

      probe.tipPosition = [5, 6, 7];
      probe.rotation = [0.1, 0.2, 0.3];
      await flushPromises();

      const solution = solveDisplayedChain(wrapper, pinia);
      expect(
        isCoordinateSystemSolutionAtPose(
          solution,
          probe.tipPosition,
          probe.rotation,
          1e-3
        )
      ).toBe(true);
      expect(useCurrentExperimentStore(pinia).probeGhost).toBeNull();
    });

    it("draws a ghost at the closest reachable pose while an unreachable drag cannot be solved, and clears it once the drag is back in reach", async () => {
      const { wrapper, store, pinia, probe } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);

      store.draggedProbeId = probe.id;
      probe.tipPosition = [1, 2, 3];
      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2];
      await flushPromises();

      // A single warm-seed miss must not flash the ghost.
      expect(store.probeGhost).toBeNull();

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2.01];
      await flushPromises();
      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2.02];
      await flushPromises();

      expect(store.probeGhost).not.toBeNull();
      expect(store.probeGhost?.probeId).toBe(probe.id);
      expect(probe.tipPosition).toEqual([1, 2, 3]);

      probe.rotation = [0, 0, 0.3];
      await flushPromises();

      expect(store.probeGhost).toBeNull();
    });

    it("snaps the probe onto the ghost's pose and clears the ghost when an unreachable drag is released", async () => {
      const { wrapper, store, pinia, probe } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);

      store.draggedProbeId = probe.id;
      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2];
      await flushPromises();
      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2.01];
      await flushPromises();
      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2.02];
      await flushPromises();
      expect(store.probeGhost).not.toBeNull();

      store.draggedProbeId = null;
      await flushPromises();

      expect(store.probeGhost).toBeNull();
      const solution = solveDisplayedChain(wrapper, pinia);
      expect(
        isCoordinateSystemSolutionAtPose(
          solution,
          probe.tipPosition,
          probe.rotation,
          1e-3
        )
      ).toBe(true);
    });

    it("reports nothing while a drag cannot be solved, leaving the ghost as the only cue", async () => {
      const { wrapper, store, pinia, probe } = mountInspector();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await selectMultiNodeSystem(wrapper, pinia);

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValue("timeout");
      store.draggedProbeId = probe.id;
      probe.rotation = [0, 0, 2];
      await flushPromises();
      probe.rotation = [0, 0, 2.01];
      await flushPromises();
      probe.rotation = [0, 0, 2.02];
      await flushPromises();

      expect(store.probeGhost).not.toBeNull();
      expect(notifySpy).not.toHaveBeenCalled();
    });

    it("reports nothing when a released drag diverged", async () => {
      const { wrapper, store, pinia, probe } = mountInspector();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await selectMultiNodeSystem(wrapper, pinia);

      store.draggedProbeId = probe.id;
      probe.rotation = [0, 0, 2];
      await flushPromises();

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "diverged"
      );
      store.draggedProbeId = null;
      await flushPromises();

      expect(notifySpy).not.toHaveBeenCalled();
    });

    it("reports a released drag that timed out", async () => {
      const { wrapper, store, pinia, probe } = mountInspector();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await selectMultiNodeSystem(wrapper, pinia);

      store.draggedProbeId = probe.id;
      probe.rotation = [0, 0, 2];
      await flushPromises();

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      store.draggedProbeId = null;
      await flushPromises();

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith({
        message: t.inverseKinematicsFailed,
        caption: t.inverseKinematicsTimeout,
        type: "negative"
      });
    });

    it("reports a non-drag solve with no adjustable values", async () => {
      const { wrapper, pinia, probe } = mountInspector();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await selectMultiNodeSystem(wrapper, pinia);

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "noFreeValues"
      );
      probe.rotation = [0, 0, 2];
      await flushPromises();

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith({
        message: t.inverseKinematicsFailed,
        caption: t.inverseKinematicsNoFreeValues,
        type: "negative"
      });
    });

    it("reports a repeated failure only once per excursion out of reach", async () => {
      const { wrapper, pinia, probe } = mountInspector();
      const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
      await selectMultiNodeSystem(wrapper, pinia);

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2];
      await flushPromises();
      expect(notifySpy).toHaveBeenCalledTimes(1);

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2.1];
      await flushPromises();
      expect(notifySpy).toHaveBeenCalledTimes(1);
    });

    it("draws the ghost on the first unreachable external change, which has no next solve to wait for", async () => {
      const { wrapper, store, pinia, probe } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2];
      await flushPromises();

      expect(store.probeGhost?.probeId).toBe(probe.id);
    });

    it("re-runs the preview solve for the newest pose when a drag frame lands mid-solve", async () => {
      const openGates: Array<() => void> = [];
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: () => {
          const { promise, resolve } =
            Promise.withResolvers<ProbeSurfaceTargets | null>();
          openGates.push(() => resolve(null));
          return promise;
        },
        isOnSurface: vi.fn()
      });
      const { wrapper, store, pinia, probe } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);
      // Drain the gate the initial external solve opened.
      openGates.forEach(open => open());
      await flushPromises();
      openGates.length = 0;

      store.draggedProbeId = probe.id;
      probe.rotation = [0, 0, 0.2];
      await flushPromises();
      probe.rotation = [0, 0, 0.4];
      await flushPromises();
      expect(openGates).toHaveLength(1);

      openGates[0]!();
      await flushPromises();
      expect(openGates).toHaveLength(2);

      openGates[1]!();
      await flushPromises();
      const solution = solveDisplayedChain(wrapper, pinia);
      expect(
        isCoordinateSystemSolutionAtPose(
          solution,
          probe.tipPosition,
          probe.rotation,
          1e-3
        )
      ).toBe(true);
    });

    it("drops a solve reply superseded by a probe swap instead of applying it to the newly seeded probe", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      useProbeLibraryStore(pinia).add(makeProbeInterfaceProbe());
      const store = useCurrentExperimentStore(pinia);
      const a = makeProbe({ name: "A" });
      const b = makeProbe({ name: "B" });
      store.experiment.probes = [a, b];
      const coordinateSystemLibrary = useCoordinateSystemLibraryStore(pinia);
      setProbeCoordinateSystem(
        store.experiment,
        a,
        coordinateSystemLibrary.library[0]!
      );

      const openGates: Array<() => void> = [];
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: () => {
          const { promise, resolve } =
            Promise.withResolvers<ProbeSurfaceTargets | null>();
          openGates.push(() => resolve(null));
          return promise;
        },
        isOnSurface: vi.fn()
      });

      const wrapper = mountWithQuasar(ProbeInspector, {
        pinia,
        props: { probe: a },
        global: { provide: babylonRuntimeProvide }
      });
      // Drain A's initial external solve from seeding.
      openGates.forEach(open => open());
      await flushPromises();
      openGates.length = 0;

      // Drag-then-release A: the release solve's surface check gate is held open below.
      store.draggedProbeId = a.id;
      await flushPromises();
      openGates[0]!();
      await flushPromises();
      openGates.length = 0;
      store.draggedProbeId = null;
      await flushPromises();
      expect(openGates).toHaveLength(1);

      const bTipPositionBeforeSwap = [...b.tipPosition];
      const bRotationBeforeSwap = [...b.rotation];

      // Selecting probe B without unmounting reuses this instance, exactly as
      // `Inspector.vue`'s unkeyed `v-if` does.
      await wrapper.setProps({ probe: b } as Record<string, unknown>);

      const solveCallsBeforeRelease = vi.mocked(
        solveCoordinateSystemChainInverse
      ).mock.calls.length;
      vi.mocked(solveCoordinateSystemChainInverse).mockImplementationOnce(
        chain => {
          chain[0]!.position[0]!.value = 999;
          chain[0]!.position[1]!.value = 999;
          chain[0]!.position[2]!.value = 999;
          return "stalled";
        }
      );

      openGates[0]!();
      await flushPromises();

      expect(
        vi.mocked(solveCoordinateSystemChainInverse).mock.calls.length
      ).toBe(solveCallsBeforeRelease);
      expect(b.tipPosition).toEqual(bTipPositionBeforeSwap);
      expect(b.rotation).toEqual(bRotationBeforeSwap);
      expect(
        wrapper.findAll(".text-body2.text-weight-bold").map(node => node.text())
      ).toEqual([]);
    });

    it("re-solves when the probe returns to the exact pose this inspector's own correction wrote", async () => {
      const { wrapper, store, pinia, probe } = mountInspector();
      await selectMultiNodeSystem(wrapper, pinia);

      store.draggedProbeId = probe.id;
      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2];
      await flushPromises();
      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2.01];
      await flushPromises();
      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2.02];
      await flushPromises();

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      store.draggedProbeId = null;
      await flushPromises();
      const correctedRotation: [number, number, number] = [...probe.rotation];

      probe.rotation = [0, 0, 0];
      await flushPromises();

      const solveCallsBeforeReturn = vi.mocked(
        solveCoordinateSystemChainInverse
      ).mock.calls.length;
      probe.rotation = correctedRotation;
      await flushPromises();

      expect(
        vi.mocked(solveCoordinateSystemChainInverse).mock.calls.length
      ).toBeGreaterThan(solveCallsBeforeReturn);
    });

    it("routes a single-node chain with a user-constrained value through the solver instead of the direct fast path", async () => {
      const { store, probe } = mountInspector();
      const bounded = makeCoordinateSystem({
        id: "bounded-tip",
        name: "Bounded Tip",
        chain: [
          buildCoordinateSystemNode(
            "Tip",
            [
              buildCoordinateSystemValue("ML", 0, "user"),
              buildCoordinateSystemValue("DV"),
              buildCoordinateSystemValue("AP")
            ],
            [
              buildCoordinateSystemValue("Pitch"),
              buildCoordinateSystemValue("Yaw"),
              buildCoordinateSystemValue("Roll")
            ],
            [0, 1, 2],
            [0, 1, 2]
          )
        ]
      });
      setProbeCoordinateSystem(store.experiment, probe, bounded);
      await flushPromises();

      store.draggedProbeId = probe.id;
      probe.tipPosition = [0, 0, 300];
      await flushPromises();
      expect(store.probeGhost).toBeNull();
      probe.tipPosition = [0, 0, 300.01];
      await flushPromises();
      probe.tipPosition = [0, 0, 300.02];
      await flushPromises();

      expect(store.probeGhost).not.toBeNull();
      expect(store.probeGhost?.probeId).toBe(probe.id);
      expect(probe.tipPosition).toEqual([0, 0, 300.02]);
    });

    it("does not rewrite the probe pose or drop the ghost when a field is re-committed with a different-text same-value edit", async () => {
      const { wrapper, store, pinia, probe } = mountInspector();
      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;
      await selectMultiNodeSystem(wrapper, pinia);

      vi.mocked(solveCoordinateSystemChainInverse).mockReturnValueOnce(
        "timeout"
      );
      probe.rotation = [0, 0, 2];
      await flushPromises();
      expect(store.probeGhost?.probeId).toBe(probe.id);
      const rotationBeforeRecommit = [...probe.rotation];

      const depthValueName = surfaceAndDepth.chain[1]!.position.find(
        ({ mode }) => mode !== "fixed"
      )!.name;
      const field = fieldByLabel(wrapper, depthValueName);
      const currentText = field.props("modelValue") as string;
      // A different display string that parses to the identical numeric value: this is the
      // case Vue's `defineModel` equality check cannot gate, since the committed text differs
      // from the field's current text even though the underlying value does not change.
      const sameValueDifferentText = `${currentText}0`;

      await editAndBlur(field, sameValueDifferentText);

      expect(store.probeGhost?.probeId).toBe(probe.id);
      expect(probe.rotation).toEqual(rotationBeforeRecommit);
    });

    it("keeps the off-surface warning visible for a surface node whose values are all fixed", async () => {
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsCrossingBrain(),
        isOnSurface: vi.fn().mockResolvedValue(false)
      });
      const { wrapper, store, probe } = mountInspector();
      const fixedSurfaceNode = buildCoordinateSystemNode(
        "Fixed Surface",
        [
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue()
        ],
        [
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue()
        ],
        [0, 1, 2],
        [0, 1, 2],
        true
      );
      const adjustableNode = buildCoordinateSystemNode(
        "Adjustable",
        [
          buildCoordinateSystemValue("X"),
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue()
        ],
        [
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue()
        ]
      );
      const custom = buildCoordinateSystem("Fixed On Surface", [
        fixedSurfaceNode,
        adjustableNode
      ]);
      setProbeCoordinateSystem(store.experiment, probe, custom);
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(1);
      expect(
        wrapper.findAll(".text-body2.text-weight-bold").map(node => node.text())
      ).toEqual(["Fixed Surface", "Adjustable"]);
    });

    describe("surface marker", () => {
      it("publishes the surface node's solved position after selecting a multi-node system", async () => {
        vi.mocked(useProbeSurface).mockReturnValue({
          findTargets: findTargetsCrossingBrain(),
          isOnSurface: vi.fn().mockResolvedValue(true)
        });
        const { wrapper, pinia, store, probe } = mountInspector();

        await selectMultiNodeSystem(wrapper, pinia);

        const solution = solveDisplayedChain(wrapper, pinia);
        expect(store.probeSurfaceMarker?.probeId).toBe(probe.id);
        store.probeSurfaceMarker!.position.forEach((value, index) => {
          expect(value).toBeCloseTo(solution.nodePositions[0]![index]!);
        });
      });

      it("moves the marker through a forward-kinematics edit of the surface node's AP field, keeping the probeId", async () => {
        vi.mocked(useProbeSurface).mockReturnValue({
          findTargets: findTargetsCrossingBrain(),
          isOnSurface: vi.fn().mockResolvedValue(true)
        });
        const { wrapper, pinia, store, probe } = mountInspector();
        await selectMultiNodeSystem(wrapper, pinia);
        const before = [...store.probeSurfaceMarker!.position];

        await editAndBlur(fieldByLabel(wrapper, "AP"), "2");

        expect(store.probeSurfaceMarker?.probeId).toBe(probe.id);
        expect(store.probeSurfaceMarker?.position).not.toEqual(before);
      });

      it("hides the marker when the probe does not cross the brain", async () => {
        vi.mocked(useProbeSurface).mockReturnValue({
          findTargets: findTargetsMissingBrain(),
          isOnSurface: vi.fn().mockResolvedValue(true)
        });
        const { wrapper, pinia, store } = mountInspector();

        await selectMultiNodeSystem(wrapper, pinia);

        expect(store.probeSurfaceMarker).toBeNull();
      });

      it("hides the marker once the probe stops crossing the brain", async () => {
        const findTargets = findTargetsCrossingBrain();
        vi.mocked(useProbeSurface).mockReturnValue({
          findTargets,
          isOnSurface: vi.fn().mockResolvedValue(true)
        });
        const { wrapper, pinia, store, probe } = mountInspector();
        await selectMultiNodeSystem(wrapper, pinia);
        expect(store.probeSurfaceMarker).not.toBeNull();

        findTargets.mockResolvedValue({
          insideMillimeters: null,
          axisMillimeters: [1, 2, 3],
          dorsoventralMillimeters: null
        });
        probe.tipPosition = [9, 9, 9];
        await flushPromises();

        expect(store.probeSurfaceMarker).toBeNull();
      });

      it("leaves the marker null when the annotation volume is unavailable", async () => {
        vi.mocked(useProbeSurface).mockReturnValue({
          findTargets: vi.fn().mockResolvedValue(null),
          isOnSurface: vi.fn().mockResolvedValue(true)
        });
        const { wrapper, pinia, store } = mountInspector();

        await selectMultiNodeSystem(wrapper, pinia);

        expect(store.probeSurfaceMarker).toBeNull();
      });

      it("leaves the marker null for the default system, which has no onSurface node", () => {
        const { store } = mountInspector();

        expect(store.probeSurfaceMarker).toBeNull();
      });

      it("clears the marker on unmount", async () => {
        vi.mocked(useProbeSurface).mockReturnValue({
          findTargets: findTargetsCrossingBrain(),
          isOnSurface: vi.fn().mockResolvedValue(true)
        });
        const { wrapper, pinia, store } = mountInspector();
        await selectMultiNodeSystem(wrapper, pinia);
        expect(store.probeSurfaceMarker).not.toBeNull();

        wrapper.unmount();

        expect(store.probeSurfaceMarker).toBeNull();
      });

      it("marches once for the solve and once for the commit re-check on an external pose change", async () => {
        const findTargets = findTargetsCrossingBrain();
        vi.mocked(useProbeSurface).mockReturnValue({
          findTargets,
          isOnSurface: vi.fn().mockResolvedValue(true)
        });
        const { wrapper, pinia, probe } = mountInspector();
        await selectMultiNodeSystem(wrapper, pinia);
        const before = findTargets.mock.calls.length;

        probe.tipPosition = [9, 9, 9];
        await flushPromises();

        expect(findTargets.mock.calls.length).toBe(before + 2);
      });

      it("publishes the marker on the direct path after one surface march", async () => {
        const findTargets = vi.fn().mockResolvedValue({
          insideMillimeters: [1, 2, 3],
          axisMillimeters: null,
          dorsoventralMillimeters: null
        });
        vi.mocked(useProbeSurface).mockReturnValue({
          findTargets,
          isOnSurface: vi.fn().mockResolvedValue(true)
        });
        const { store, probe } = mountInspector();

        setProbeCoordinateSystem(
          store.experiment,
          probe,
          makeCoordinateSystem({
            offsetByReferenceCoordinate: true,
            id: "surface-tip",
            name: "Surface Tip",
            chain: [
              buildCoordinateSystemNode(
                "Tip",
                [
                  buildCoordinateSystemValue("ML"),
                  buildCoordinateSystemValue("DV"),
                  buildCoordinateSystemValue("AP")
                ],
                [
                  buildCoordinateSystemValue("Pitch"),
                  buildCoordinateSystemValue("Yaw"),
                  buildCoordinateSystemValue("Roll")
                ],
                [0, 1, 2],
                [0, 1, 2],
                true
              )
            ]
          })
        );
        await flushPromises();

        expect(store.probeSurfaceMarker).not.toBeNull();
        expect(store.probeSurfaceMarker?.probeId).toBe(probe.id);
        expect(findTargets).toHaveBeenCalledTimes(1);
      });

      it("hides a stale marker immediately on a probe swap, before the new probe has marched", async () => {
        const pinia = createPinia();
        setActivePinia(pinia);
        useProbeLibraryStore(pinia).add(makeProbeInterfaceProbe());
        const store = useCurrentExperimentStore(pinia);
        const a = makeProbe({ name: "A" });
        const b = makeProbe({ name: "B" });
        store.experiment.probes = [a, b];
        const coordinateSystemLibrary = useCoordinateSystemLibraryStore(pinia);
        setProbeCoordinateSystem(
          store.experiment,
          a,
          coordinateSystemLibrary.library[0]!
        );
        setProbeCoordinateSystem(
          store.experiment,
          b,
          coordinateSystemLibrary.library[0]!
        );
        vi.mocked(useProbeSurface).mockReturnValue({
          findTargets: findTargetsCrossingBrain(),
          isOnSurface: vi.fn().mockResolvedValue(true)
        });

        const wrapper = mountWithQuasar(ProbeInspector, {
          pinia,
          props: { probe: a },
          global: { provide: babylonRuntimeProvide }
        });
        await flushPromises();
        expect(store.probeSurfaceMarker?.probeId).toBe(a.id);

        // Selecting probe B without unmounting reuses this instance, exactly as
        // `Inspector.vue`'s unkeyed `v-if` does.
        await wrapper.setProps({ probe: b } as Record<string, unknown>);

        // B has not marched yet, so A's stale marker must not linger at B's unsolved position.
        expect(store.probeSurfaceMarker).toBeNull();

        await flushPromises();
        expect(store.probeSurfaceMarker?.probeId).toBe(b.id);
      });
    });
  });

  describe("solve pose button", () => {
    it("does not show for the default coordinate system", () => {
      const { wrapper } = mountInspector();

      expect(buttonByLabel(wrapper, t.solvePose)).toBeUndefined();
    });

    it("shows once a coordinate system is selected", async () => {
      const { wrapper, pinia } = mountInspector();
      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;

      selectByLabel(wrapper, t.coordinateSystem).vm.$emit(
        "update:modelValue",
        surfaceAndDepth.id
      );
      await wrapper.vm.$nextTick();

      expect(buttonByLabel(wrapper, t.solvePose)).toBeDefined();
    });

    it("runs one settled solve for the probe's current pose, leaving it unmoved", async () => {
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsCrossingBrain(),
        isOnSurface: vi.fn().mockResolvedValue(true)
      });
      const { wrapper, store, probe, pinia } = mountInspector(
        makeProbe({ tipPosition: [7, 8, 9], rotation: [0.1, 0.2, 0.3] })
      );
      const surfaceAndDepth =
        useCoordinateSystemLibraryStore(pinia).library[0]!;
      setProbeCoordinateSystem(store.experiment, probe, surfaceAndDepth);
      await flushPromises();
      vi.mocked(solveCoordinateSystemChainInverse).mockClear();

      await buttonByLabel(wrapper, t.solvePose).trigger("click");
      await flushPromises();

      expect(solveCoordinateSystemChainInverse).toHaveBeenCalledTimes(1);
      const [, target, , maximumStarts] = vi.mocked(
        solveCoordinateSystemChainInverse
      ).mock.calls[0]!;
      expect(maximumStarts).toBe(SETTLED_SOLVE_STARTS);
      expect(target.rotation).toEqual([0.1, 0.2, 0.3]);
      expect(probe.tipPosition).toEqual([7, 8, 9]);
      expect(probe.rotation).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe("direct chain surface warning", () => {
    /** A single all-adjustable node marked onSurface, so `directNode` stays non-null. */
    function buildSurfaceTip() {
      return makeCoordinateSystem({
        id: "surface-tip",
        name: "Surface Tip",
        chain: [
          buildCoordinateSystemNode(
            "Tip",
            [
              buildCoordinateSystemValue("ML"),
              buildCoordinateSystemValue("DV"),
              buildCoordinateSystemValue("AP")
            ],
            [
              buildCoordinateSystemValue("Pitch"),
              buildCoordinateSystemValue("Yaw"),
              buildCoordinateSystemValue("Roll")
            ],
            [0, 1, 2],
            [0, 1, 2],
            true
          )
        ]
      });
    }

    it("warns at once when selected while the probe crosses the brain", async () => {
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsCrossingBrain(),
        isOnSurface: vi.fn().mockResolvedValue(false)
      });
      const { wrapper, store, probe } = mountInspector();

      setProbeCoordinateSystem(store.experiment, probe, buildSurfaceTip());
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(1);
    });

    it("never samples the surface when the probe misses the brain across drag frames", async () => {
      const isOnSurface = vi.fn().mockResolvedValue(false);
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsMissingBrain(),
        isOnSurface
      });
      const { wrapper, store, probe } = mountInspector();

      setProbeCoordinateSystem(store.experiment, probe, buildSurfaceTip());
      await flushPromises();

      store.draggedProbeId = probe.id;
      probe.rotation = [0, 0, 0.1];
      await flushPromises();
      probe.rotation = [0, 0, 0.2];
      await flushPromises();
      probe.rotation = [0, 0, 0.3];
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(0);
      expect(isOnSurface).not.toHaveBeenCalled();
    });

    it("debounces a preview warning across drag frames on the direct path", async () => {
      let onSurface: boolean | null = true;
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets: findTargetsCrossingBrain(),
        isOnSurface: vi.fn(async () => onSurface)
      });
      const { wrapper, store, probe } = mountInspector();

      setProbeCoordinateSystem(store.experiment, probe, buildSurfaceTip());
      await flushPromises();

      onSurface = false;
      store.draggedProbeId = probe.id;
      probe.rotation = [0, 0, 0.1];
      await flushPromises();
      probe.rotation = [0, 0, 0.2];
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(0);

      probe.rotation = [0, 0, 0.3];
      await flushPromises();

      expect(
        wrapper
          .findAll(".text-warning")
          .filter(node => node.text() === t.offSurface)
      ).toHaveLength(1);
    });
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

      const select = selectByLabel(wrapper, t.probeType);
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

      expect(selectByLabel(wrapper, t.probeType).text()).toContain(
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

      selectByLabel(wrapper, t.probeType).vm.$emit(
        "update:modelValue",
        getProbeInterfaceIdentifier(newSpec)
      );
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

      selectByLabel(wrapper, t.probeType).vm.$emit(
        "update:modelValue",
        "unknown manufacturer unknown-model"
      );
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
    it("resets the tip position to the reference coordinate on home click", async () => {
      const { wrapper, probe, store } = mountInspector(
        makeProbe({ tipPosition: [1, 2, 3] })
      );
      store.experiment.referenceCoordinate = [7, 8, 9];

      await buttonByLabel(wrapper, t.home).trigger("click");

      expect(probe.tipPosition).toEqual([7, 8, 9]);
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
      const valueNames = [
        axis.ap,
        axis.dv,
        axis.ml,
        axis.roll,
        axis.yaw,
        axis.pitch
      ];

      for (const label of valueNames) {
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
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface: vi.fn()
      });
      const { wrapper, store, probe } = mountInspector();

      await buttonByLabel(wrapper, t.surface).trigger("click");
      await flushPromises();

      expect(probe.tipPosition).toEqual([1, 2, 3]);
      expect(store.probeSurfaceChoice).toBeNull();
    });

    it("sets the pending choice and leaves the tip unchanged when both targets are available", async () => {
      const findTargets = vi.fn().mockResolvedValue({
        insideMillimeters: null,
        axisMillimeters: [1, 2, 3],
        dorsoventralMillimeters: [4, 5, 6]
      } satisfies ProbeSurfaceTargets);
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface: vi.fn()
      });
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
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface: vi.fn()
      });
      const { wrapper, store, probe } = mountInspector();

      await buttonByLabel(wrapper, t.surface).trigger("click");
      await flushPromises();

      expect(probe.tipPosition).toEqual([1, 2, 3]);
      expect(store.probeSurfaceChoice).toBeNull();
    });

    it("shows a no-surface-found warning and leaves the tip unchanged on all-null targets", async () => {
      const findTargets = vi.fn().mockResolvedValue({
        insideMillimeters: null,
        axisMillimeters: null,
        dorsoventralMillimeters: null
      } satisfies ProbeSurfaceTargets);
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface: vi.fn()
      });
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
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface: vi.fn()
      });
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
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface: vi.fn()
      });
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
      const findTargets = vi.fn((_probe: unknown, signal?: AbortSignal) => {
        capturedSignal = signal;
        return new Promise<ProbeSurfaceTargets | null>(resolve => {
          resolveTargets = resolve;
        });
      });
      vi.mocked(useProbeSurface).mockReturnValue({
        findTargets,
        isOnSurface: vi.fn()
      });
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
