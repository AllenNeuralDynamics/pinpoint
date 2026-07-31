import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type {
  ArcRotateCamera,
  GizmoManager,
  Scene,
  SelectionOutlineLayer
} from "@babylonjs/core";
import { shallowRef } from "vue";
import SceneCanvas from "./SceneCanvas.vue";
import {
  initializeTestCSG2,
  makeTestSceneWithGizmo,
  mountWithQuasar
} from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  removeAllStructures,
  setAtlasCenterOffset,
  syncStructuresVisibility
} from "../api/structures.api";
import { setInitialZoom } from "../api/camera.api";
import {
  getAtlasCenter,
  getManifest,
  getTerminologyRows,
  structureEntitiesFromIdentifiers
} from "@/features/atlas";
import {
  addProbe,
  buildExperiment,
  internProbeInterfaceProbe,
  setProbeInterface
} from "@/features/experiment";
import { getProbeInterfaceIdentifier } from "@/features/probe";
import type { BabylonRuntimeService } from "@/services/babylon-runtime.service";
import { BabylonRuntimeServiceKey } from "@/services/babylon-runtime.service";
import {
  makeAtlas,
  makeManifest,
  makeProbe,
  makeProbeInterfaceProbe,
  makeTerminologyRows
} from "@/test/fixtures";
import { getProbeTransformNode } from "../api/probe.api";

vi.mock("../api/structures.api", async () => {
  const actual = await vi.importActual<typeof import("../api/structures.api")>(
    "../api/structures.api"
  );
  return {
    ...actual,
    syncStructuresVisibility: vi.fn(),
    setAtlasCenterOffset: vi.fn(),
    removeAllStructures: vi.fn()
  };
});

vi.mock("../api/camera.api", async () => {
  const actual =
    await vi.importActual<typeof import("../api/camera.api")>(
      "../api/camera.api"
    );
  return { ...actual, setInitialZoom: vi.fn() };
});

// `useCurrentExperimentStore`'s `manifest` and `terminologyRows` are
// `computedAsync`, fetching from this module whenever the store is created
// -- both must be mocked or mounting this component triggers real network
// requests. Mocking the leaf module (rather than the `@/features/atlas`
// barrel it's re-exported through) is required: mocking the barrel by the
// same specifier it re-exports from doesn't consistently intercept the
// store's own import of it.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getManifest: vi.fn(),
    getTerminologyRows: vi.fn(),
    structureEntitiesFromIdentifiers: vi.fn()
  };
});

type CanvasWrapper = VueWrapper<InstanceType<typeof SceneCanvas>>;

// Mounted wrappers aren't teleported, but SceneCanvas's `onUnmounted` disposes
// the runtime, and stray unresolved `watchEffect`s from a prior test could
// otherwise fire against the next test's mocks -- unmount explicitly.
const mountedWrappers: CanvasWrapper[] = [];

/**
 * Build a `BabylonRuntimeService`-shaped stub whose `init` synchronously
 * assigns a real `NullEngine`-backed `Scene`, a real `GizmoManager` and
 * `SelectionOutlineLayer` (both construct fine under `NullEngine`), and a
 * bare camera object, so `SceneCanvas`'s `watchEffect`s -- including probe
 * sync, gizmo drag, and selection -- have something to react to without a
 * real WebGPU context.
 */
function makeRuntimeStub() {
  const engine = shallowRef<{ resize: () => void } | null>(null);
  const scene = shallowRef<Scene | null>(null);
  const camera = shallowRef<ArcRotateCamera | null>(null);
  const gizmoManager = shallowRef<GizmoManager | null>(null);
  const selectionOutlineLayer = shallowRef<SelectionOutlineLayer | null>(null);
  const resize = vi.fn();
  const dispose = vi.fn();

  const init = vi.fn(async () => {
    const built = makeTestSceneWithGizmo();
    engine.value = { resize };
    scene.value = built.scene;
    camera.value = { radius: 0 } as ArcRotateCamera;
    gizmoManager.value = built.gizmoManager;
    selectionOutlineLayer.value = built.selectionOutlineLayer;
  });

  return {
    engine,
    scene,
    camera,
    gizmoManager,
    selectionOutlineLayer,
    init,
    dispose,
    resize
  } as unknown as BabylonRuntimeService & { resize: () => void };
}

/**
 * Mount `SceneCanvas` with a fresh runtime stub injected in place of the
 * real Babylon runtime service, wait for `onMounted`'s `init` to resolve,
 * and flush the store's `manifest` -> `terminologyRows` `computedAsync`
 * chain (two microtask rounds, same hop documented in
 * `AtlasHierarchy.spec.ts`).
 */
async function mountCanvas(runtime = makeRuntimeStub()) {
  const wrapper = mountWithQuasar(SceneCanvas, {
    global: { provide: { [BabylonRuntimeServiceKey as symbol]: runtime } }
  }) as CanvasWrapper;
  mountedWrappers.push(wrapper);
  await flushPromises();
  await flushPromises();
  return { wrapper, runtime };
}

describe("SceneCanvas", () => {
  beforeAll(async () => {
    await initializeTestCSG2();
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getManifest).mockReset();
    vi.mocked(getManifest).mockResolvedValue(makeManifest());
    vi.mocked(getTerminologyRows).mockReset();
    vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());
    vi.mocked(structureEntitiesFromIdentifiers).mockReset();
    vi.mocked(structureEntitiesFromIdentifiers).mockReturnValue([]);
    vi.mocked(syncStructuresVisibility).mockReset();
    vi.mocked(syncStructuresVisibility).mockResolvedValue(undefined);
    vi.mocked(setAtlasCenterOffset).mockReset();
    vi.mocked(removeAllStructures).mockReset();
    vi.mocked(setInitialZoom).mockReset();
  });

  afterEach(() => {
    mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount());
  });

  it("initializes the runtime with the mounted canvas element", async () => {
    const { wrapper, runtime } = await mountCanvas();

    expect(runtime.init).toHaveBeenCalledTimes(1);
    const canvasArg = vi.mocked(runtime.init).mock.calls[0]![0];
    expect(canvasArg).toBe(wrapper.find("canvas").element);
  });

  it("syncs structures built from the manifest, not the atlas", async () => {
    const manifest = makeManifest();
    vi.mocked(getManifest).mockResolvedValue(manifest);
    const terminologyRows = makeTerminologyRows();
    vi.mocked(getTerminologyRows).mockResolvedValue(terminologyRows);

    await mountCanvas();

    expect(structureEntitiesFromIdentifiers).toHaveBeenCalledWith(
      manifest,
      terminologyRows,
      expect.anything()
    );
    expect(syncStructuresVisibility).toHaveBeenCalled();
  });

  it("syncs empty structure lists while the atlas components are still evaluating", async () => {
    // Never resolves, so `isManifestEvaluating` (and therefore
    // `areAtlasComponentsEvaluating`) stays true throughout.
    vi.mocked(getManifest).mockReturnValue(new Promise(() => {}));

    await mountCanvas();

    expect(syncStructuresVisibility).toHaveBeenCalledWith(
      expect.anything(),
      [],
      []
    );
    expect(structureEntitiesFromIdentifiers).not.toHaveBeenCalled();
  });

  it("shows the loading bar while a sync is in flight and hides it after", async () => {
    let resolveSync!: () => void;
    vi.mocked(syncStructuresVisibility).mockReturnValue(
      new Promise(resolve => (resolveSync = () => resolve(undefined)))
    );

    const { wrapper } = await mountCanvas();

    expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
      true
    );

    resolveSync();
    await flushPromises();

    expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
      false
    );
  });

  it("notifies a negative error and clears the loading bar when the sync fails", async () => {
    // Gate the sync on a deferred promise so the rejection lands only after
    // the wrapper (and its `$q`) is available to spy on -- an immediately
    // rejected mock would fire the `watchEffect`'s `catch` during
    // `mountCanvas`'s own flushes, before there's anything to spy on.
    let rejectSync!: (error: Error) => void;
    vi.mocked(syncStructuresVisibility).mockReturnValue(
      new Promise((_, reject) => (rejectSync = reject))
    );

    const { wrapper } = await mountCanvas();
    const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

    rejectSync(new Error("mesh load failed"));
    await flushPromises();

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ color: "warning" })
    );
    expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
      false
    );
  });

  it("offsets the atlas root by the atlas center once the manifest resolves", async () => {
    await mountCanvas();

    expect(setAtlasCenterOffset).toHaveBeenCalledWith(
      expect.anything(),
      getAtlasCenter(makeManifest())
    );
  });

  it("re-offsets when the experiment's atlas changes", async () => {
    await mountCanvas();
    vi.mocked(setAtlasCenterOffset).mockClear();

    const manifest = makeManifest({
      resolutions: [[0.02, 0.02, 0.02]],
      shape: [[100, 100, 100]]
    });
    vi.mocked(getManifest).mockResolvedValue(manifest);

    const store = useCurrentExperimentStore();
    store.experiment = buildExperiment(
      "New Experiment",
      makeAtlas({ name: "allen_human" }),
      [0, 0, 0]
    );
    await flushPromises();
    await flushPromises();

    expect(setAtlasCenterOffset).toHaveBeenCalledWith(
      expect.anything(),
      [1, 1, 1]
    );
  });

  it("offsets by the resolved atlas center even while terminology rows are still loading", async () => {
    vi.mocked(getManifest).mockResolvedValue(
      makeManifest({
        resolutions: [[0.02, 0.02, 0.02]],
        shape: [[100, 100, 100]]
      })
    );
    vi.mocked(getTerminologyRows).mockReturnValue(new Promise(() => {}));

    await mountCanvas();

    expect(setAtlasCenterOffset).toHaveBeenCalledWith(
      expect.anything(),
      [1, 1, 1]
    );
  });

  it("sets the camera's initial zoom from the manifest once it resolves", async () => {
    const manifest = makeManifest();
    vi.mocked(getManifest).mockResolvedValue(manifest);

    const { runtime } = await mountCanvas();

    expect(setInitialZoom).toHaveBeenCalledWith(runtime.camera.value, manifest);
  });

  it("does not set the camera's initial zoom while the atlas components are evaluating", async () => {
    vi.mocked(getManifest).mockReturnValue(new Promise(() => {}));

    await mountCanvas();

    expect(setInitialZoom).not.toHaveBeenCalled();
  });

  it("clears the scene when the experiment's atlas changes", async () => {
    await mountCanvas();
    expect(removeAllStructures).not.toHaveBeenCalled();

    const store = useCurrentExperimentStore();
    store.experiment = buildExperiment(
      "New Experiment",
      makeAtlas({ name: "allen_human" }),
      [0, 0, 0]
    );
    await flushPromises();

    expect(removeAllStructures).toHaveBeenCalledTimes(1);
  });

  it("resizes the engine when the resize observer fires", async () => {
    const { wrapper, runtime } = await mountCanvas();

    await wrapper.findComponent({ name: "QResizeObserver" }).vm.$emit("resize");

    expect(runtime.resize).toHaveBeenCalledTimes(1);
  });

  it("disposes the runtime on unmount", async () => {
    const { wrapper, runtime } = await mountCanvas();

    wrapper.unmount();

    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it(
    "reattaches the gizmo and selection outline to a selected probe's new " +
      "entity when its type change disposes and rebuilds it",
    async () => {
      const { runtime } = await mountCanvas();
      const store = useCurrentExperimentStore();

      const oldProbeInterfaceProbe = makeProbeInterfaceProbe({
        probe_planar_contour: [
          [-11, 9989],
          [-11, -11],
          [24, -220],
          [59, -11],
          [59, 9989]
        ]
      });
      internProbeInterfaceProbe(store.experiment, oldProbeInterfaceProbe);
      const builtProbe = makeProbe({
        probeInterfaceIdentifier: getProbeInterfaceIdentifier(
          oldProbeInterfaceProbe
        )
      });
      addProbe(store.experiment, builtProbe);
      // Re-fetch through the store: `store.experiment` is deeply reactive,
      // so mutations must go through its own proxied element for
      // `watchEffect` to react -- mutating the plain `builtProbe` reference
      // directly (bypassing the proxy) would silently do nothing.
      const probe = store.experiment.probes.find(p => p.id === builtProbe.id)!;
      await flushPromises();

      const scene = runtime.scene.value!;
      const gizmoManager = runtime.gizmoManager.value!;
      const selectionOutlineLayer = runtime.selectionOutlineLayer.value!;
      const oldNode = getProbeTransformNode(scene, probe.id)!;
      const oldShankMesh = oldNode.getChildMeshes()[0]!;
      store.selectedInspectable = probe;
      await flushPromises();

      expect(gizmoManager.attachedNode).toBe(oldNode);

      const newProbeInterfaceProbe = makeProbeInterfaceProbe({
        annotations: { manufacturer: "imec", model_name: "np2020" },
        probe_planar_contour: [
          [-27, 9989],
          [-27, -11],
          [8, -217],
          [43, -11],
          [43, 9989]
        ]
      });
      setProbeInterface(store.experiment, probe, newProbeInterfaceProbe);
      await flushPromises();

      const newNode = getProbeTransformNode(scene, probe.id)!;
      expect(oldNode.isDisposed()).toBe(true);
      expect(newNode).not.toBe(oldNode);
      expect(gizmoManager.attachedNode).toBe(newNode);
      for (const mesh of newNode.getChildMeshes()) {
        expect(selectionOutlineLayer.hasMesh(mesh)).toBe(true);
      }
      expect(selectionOutlineLayer.hasMesh(oldShankMesh)).toBe(false);
    },
    30000
  );

  it(
    "drags and selects a probe in a new experiment after the old one is " +
      "replaced, not the discarded one",
    async () => {
      const { runtime } = await mountCanvas();
      const store = useCurrentExperimentStore();

      const contour = [
        [-11, 9989],
        [-11, -11],
        [24, -220],
        [59, -11],
        [59, 9989]
      ];
      const oldProbeInterfaceProbe = makeProbeInterfaceProbe({
        probe_planar_contour: contour
      });
      internProbeInterfaceProbe(store.experiment, oldProbeInterfaceProbe);
      const oldProbe = makeProbe({
        probeInterfaceIdentifier: getProbeInterfaceIdentifier(
          oldProbeInterfaceProbe
        )
      });
      addProbe(store.experiment, oldProbe);
      await flushPromises();

      store.experiment = buildExperiment(
        "New Experiment",
        makeAtlas(),
        [0, 0, 0]
      );
      const newProbeInterfaceProbe = makeProbeInterfaceProbe({
        probe_planar_contour: contour
      });
      internProbeInterfaceProbe(store.experiment, newProbeInterfaceProbe);
      const builtProbe = makeProbe({
        probeInterfaceIdentifier: getProbeInterfaceIdentifier(
          newProbeInterfaceProbe
        )
      });
      addProbe(store.experiment, builtProbe);
      const newProbe = store.experiment.probes.find(
        p => p.id === builtProbe.id
      )!;
      await flushPromises();

      const scene = runtime.scene.value!;
      const gizmoManager = runtime.gizmoManager.value!;
      const newNode = getProbeTransformNode(scene, newProbe.id)!;

      gizmoManager.attachToNode(newNode);
      newNode.position.set(1, 2, 3);
      gizmoManager.gizmos.positionGizmo!.onDragObservable.notifyObservers(
        {} as never
      );

      expect(newProbe.tipPosition).not.toEqual([0, 0, 0]);
      expect(store.draggedProbeId).toBe(newProbe.id);
    }
  );
});
