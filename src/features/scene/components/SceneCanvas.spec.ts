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
import { Dark } from "quasar";
import type {
  GizmoManager,
  HavokPlugin,
  HighlightLayer,
  PickingInfo,
  Scene,
  SelectionOutlineLayer
} from "@babylonjs/core";
import {
  ArcRotateCamera,
  Matrix,
  Observable,
  PointerEventTypes,
  PointerInfo,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import { shallowRef } from "vue";
import SceneCanvas from "./SceneCanvas.vue";
import type { FakeTextRenderer } from "@/test/mount-helper";
import type * as MountHelper from "@/test/mount-helper";
import {
  createWrapperRegistry,
  initializeTestCSG2,
  makeFakeTextRenderer,
  makeTestFontAsset,
  makeTestSceneWithGizmo,
  mountWithQuasar
} from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import {
  buildAtlasRootNode,
  setAtlasCenterOffset,
  syncStructuresVisibility
} from "../api/structures.api";
import { applyCameraProjection } from "../api/camera.api";
import { createAxisGuides } from "../api/axis-guide.api";
import type * as AxisGuideApi from "../api/axis-guide.api";
import {
  DEFAULT_ATLAS,
  getAtlasCenter,
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
  makeSceneModel,
  makeSceneObject,
  makeTerminologyRows
} from "@/test/fixtures";
import { getProbeTransformNode } from "../api/probe.api";
import { asrToVector3, vector3ToAsr } from "../api/coordinate-transforms.api";
import {
  buildProbeSurfacePaths,
  disposeProbeSurfacePaths
} from "../api/probe-surface-path.api";

vi.mock("../api/structures.api", async () => {
  const actual = await vi.importActual<typeof import("../api/structures.api")>(
    "../api/structures.api"
  );
  return {
    ...actual,
    syncStructuresVisibility: vi.fn(),
    setAtlasCenterOffset: vi.fn()
  };
});

vi.mock("../api/camera.api", async () => {
  const actual =
    await vi.importActual<typeof import("../api/camera.api")>(
      "../api/camera.api"
    );
  return { ...actual, applyCameraProjection: vi.fn() };
});

vi.mock("../api/axis-guide.api", async () => {
  const actual = await vi.importActual<typeof AxisGuideApi>(
    "../api/axis-guide.api"
  );
  const { makeFakeTextRenderer: makeFake, makeTestFontAsset: makeFontAsset } =
    await vi.importActual<typeof MountHelper>("@/test/mount-helper");

  return {
    ...actual,
    createAxisGuides: vi.fn(async (scene: Scene) => ({
      renderers: {
        ap: makeFake(),
        dv: makeFake(),
        ml: makeFake()
      },
      fontAsset: makeFontAsset(scene),
      dispose: vi.fn()
    }))
  };
});

vi.mock("../api/probe-surface-path.api", async () => {
  const actual = await vi.importActual<
    typeof import("../api/probe-surface-path.api")
  >("../api/probe-surface-path.api");
  return {
    ...actual,
    buildProbeSurfacePaths: vi.fn(actual.buildProbeSurfacePaths),
    disposeProbeSurfacePaths: vi.fn(actual.disposeProbeSurfacePaths)
  };
});

// `useCurrentExperimentStore`'s `terminologyRows` is `computedAsync`,
// fetching from this module whenever the store is created -- it must be
// mocked or mounting this component triggers a real network request.
// Mocking the leaf module (rather than the `@/features/atlas` barrel it's
// re-exported through) is required: mocking the barrel by the same
// specifier it re-exports from doesn't consistently intercept the store's
// own import of it.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn(),
    structureEntitiesFromIdentifiers: vi.fn()
  };
});

type CanvasWrapper = VueWrapper<InstanceType<typeof SceneCanvas>>;

// Mounted wrappers aren't teleported, but SceneCanvas's `onUnmounted` disposes
// the runtime, and stray unresolved `watchEffect`s from a prior test could
// otherwise fire against the next test's mocks -- unmount explicitly.
const wrappers = createWrapperRegistry<CanvasWrapper>();

/**
 * Build a `BabylonRuntimeService`-shaped stub whose `init` synchronously
 * assigns a real `NullEngine`-backed `Scene`, a real `GizmoManager` and
 * `SelectionOutlineLayer` (both construct fine under `NullEngine`), and a
 * bare camera object, so `SceneCanvas`'s `watchEffect`s -- including probe
 * sync, gizmo drag, and selection -- have something to react to without a
 * real rendering context, and exposes `replaceScene` to swap in a fresh
 * scene, gizmo manager, and outline layer.
 */
function makeRuntimeStub() {
  const engine = shallowRef<{ resize: () => void } | null>(null);
  const scene = shallowRef<Scene | null>(null);
  const camera = shallowRef<ArcRotateCamera | null>(null);
  const gizmoManager = shallowRef<GizmoManager | null>(null);
  const selectionOutlineLayer = shallowRef<SelectionOutlineLayer | null>(null);
  const havokPlugin = shallowRef<HavokPlugin | null>(null);
  const highlightLayer = shallowRef<HighlightLayer | null>(null);
  const resize = vi.fn();
  const dispose = vi.fn();

  const init = vi.fn(async () => {
    const built = makeTestSceneWithGizmo();
    engine.value = { resize };
    scene.value = built.scene;
    camera.value = {
      alpha: 0,
      beta: 0,
      radius: 0,
      target: Vector3.Zero(),
      inertia: 0.9,
      isInterpolating: false,
      onViewMatrixChangedObservable: new Observable(),
      onAfterCheckInputsObservable: new Observable(),
      stopInterpolation: vi.fn(),
      setTarget: vi.fn(),
      interpolateTo: vi.fn()
    } as unknown as ArcRotateCamera;
    gizmoManager.value = built.gizmoManager;
    selectionOutlineLayer.value = built.selectionOutlineLayer;
  });

  const replaceScene = () => {
    const built = makeTestSceneWithGizmo();
    scene.value = built.scene;
    gizmoManager.value = built.gizmoManager;
    selectionOutlineLayer.value = built.selectionOutlineLayer;
  };

  return {
    engine,
    scene,
    camera,
    gizmoManager,
    selectionOutlineLayer,
    havokPlugin,
    highlightLayer,
    init,
    dispose,
    resize,
    replaceScene
  } as unknown as BabylonRuntimeService & {
    resize: () => void;
    replaceScene: () => void;
  };
}

/**
 * Mount `SceneCanvas` with a fresh runtime stub injected in place of the
 * real Babylon runtime service, wait for `onMounted`'s `init` to resolve,
 * and flush the store's `terminologyRows` `computedAsync` (two microtask
 * rounds, same hop documented in `AtlasHierarchy.spec.ts`). `QPageSticky`
 * requires a `QLayout` ancestor (only present in the real app's
 * `IndexPage.vue`), so it's stubbed with a passthrough that still renders
 * its slot for the gizmo toolbar tests.
 */
async function mountCanvas(runtime = makeRuntimeStub()) {
  const wrapper = wrappers.track(
    mountWithQuasar(SceneCanvas, {
      global: {
        provide: { [BabylonRuntimeServiceKey as symbol]: runtime },
        stubs: { QPageSticky: { template: "<div><slot /></div>" } }
      }
    }) as CanvasWrapper
  );
  await flushPromises();
  await flushPromises();
  return { wrapper, runtime };
}

/**
 * Set the axis guide visibility flag on the store and let the lazy renderer
 * creation and the label rebuild settle.
 * @param visible Visibility to set.
 */
async function setAxisGuidesVisible(visible: boolean) {
  useCurrentExperimentStore().areAxisGuidesVisible = visible;
  await flushPromises();
}

/**
 * Count the scene's axis guide pick meshes -- the invisible click targets
 * that let clicking a label orbit the camera onto its axis.
 * @param scene Scene holding the axis guide pick meshes.
 */
function axisGuidePickMeshCount(scene: Scene): number {
  return scene.meshes.filter(mesh => mesh.name.startsWith("axisGuidePick_"))
    .length;
}

describe("SceneCanvas", () => {
  beforeAll(async () => {
    await initializeTestCSG2();
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getTerminologyRows).mockReset();
    vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());
    vi.mocked(structureEntitiesFromIdentifiers).mockReset();
    vi.mocked(structureEntitiesFromIdentifiers).mockReturnValue([]);
    vi.mocked(syncStructuresVisibility).mockReset();
    vi.mocked(syncStructuresVisibility).mockResolvedValue(undefined);
    vi.mocked(setAtlasCenterOffset).mockReset();
    vi.mocked(applyCameraProjection).mockReset();
    vi.mocked(createAxisGuides).mockReset();
    vi.mocked(createAxisGuides).mockImplementation(async scene => ({
      renderers: {
        ap: makeFakeTextRenderer(),
        dv: makeFakeTextRenderer(),
        ml: makeFakeTextRenderer()
      },
      fontAsset: makeTestFontAsset(scene),
      dispose: vi.fn()
    }));
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  it("initializes the runtime with the mounted canvas element", async () => {
    const { wrapper, runtime } = await mountCanvas();

    expect(runtime.init).toHaveBeenCalledTimes(1);
    const canvasArg = vi.mocked(runtime.init).mock.calls[0]![0];
    expect(canvasArg).toBe(wrapper.find("canvas").element);
  });

  it("registers exactly one axis guide double-tap observer, and removes it on unmount", async () => {
    const { wrapper, runtime } = await mountCanvas();

    const observers = () =>
      runtime.scene.value!.onPointerObservable.observers.filter(
        observer => observer.mask === PointerEventTypes.POINTERDOUBLETAP
      );
    expect(observers()).toHaveLength(1);

    wrapper.unmount();

    expect(observers()).toHaveLength(0);
  });

  it("syncs structures built from the current atlas and terminology rows", async () => {
    const terminologyRows = makeTerminologyRows();
    vi.mocked(getTerminologyRows).mockResolvedValue(terminologyRows);

    await mountCanvas();

    expect(structureEntitiesFromIdentifiers).toHaveBeenCalledWith(
      DEFAULT_ATLAS,
      terminologyRows,
      expect.anything()
    );
    expect(syncStructuresVisibility).toHaveBeenCalled();
  });

  it("splits visibleStructures into a faded call and an opaque call", async () => {
    const terminologyRows = makeTerminologyRows();
    vi.mocked(getTerminologyRows).mockResolvedValue(terminologyRows);

    await mountCanvas();
    useCurrentExperimentStore().experiment.visibleStructures = [
      { id: 8, isTransparent: true },
      { id: 567, isTransparent: false }
    ];
    await flushPromises();

    expect(structureEntitiesFromIdentifiers).toHaveBeenCalledWith(
      DEFAULT_ATLAS,
      terminologyRows,
      [8]
    );
    expect(structureEntitiesFromIdentifiers).toHaveBeenCalledWith(
      DEFAULT_ATLAS,
      terminologyRows,
      [567]
    );
  });

  it("syncs empty structure lists while terminology rows are still evaluating", async () => {
    // Never resolves, so `isTerminologyRowsEvaluating` stays true throughout.
    vi.mocked(getTerminologyRows).mockReturnValue(new Promise(() => {}));

    await mountCanvas();

    expect(syncStructuresVisibility).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [],
      []
    );
    expect(structureEntitiesFromIdentifiers).toHaveBeenCalledWith(
      expect.anything(),
      [],
      expect.anything()
    );
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

  it("shows the loading bar for a region-center load, with no delay", async () => {
    const { wrapper } = await mountCanvas();

    expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
      false
    );

    useCurrentExperimentStore().isLoadingRegionCenter = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
      true
    );

    useCurrentExperimentStore().isLoadingRegionCenter = false;
    await wrapper.vm.$nextTick();

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
      expect.objectContaining({ type: "warning" })
    );
    expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
      false
    );
  });

  it("offsets the atlas root by the current atlas center", async () => {
    await mountCanvas();

    expect(setAtlasCenterOffset).toHaveBeenCalledWith(
      expect.anything(),
      getAtlasCenter(DEFAULT_ATLAS)
    );
  });

  it("loads no axis guide text renderers or pick meshes while the toggle is off", async () => {
    const { runtime } = await mountCanvas();

    expect(createAxisGuides).not.toHaveBeenCalled();
    expect(
      runtime.scene.value!.getTransformNodeByName("axisGuideRoot_node")
    ).toBeNull();
    expect(axisGuidePickMeshCount(runtime.scene.value!)).toBe(0);
  });

  it("creates the axis guide text renderers and builds six paragraphs and pick meshes under axisGuideRoot_node when the toggle is switched on", async () => {
    const { runtime } = await mountCanvas();
    await setAxisGuidesVisible(true);

    expect(createAxisGuides).toHaveBeenCalledTimes(1);
    expect(createAxisGuides).toHaveBeenCalledWith(runtime.scene.value);

    const scene = runtime.scene.value!;
    const root = scene.getTransformNodeByName("axisGuideRoot_node")!;
    expect(root).toBeTruthy();
    expect(root.parent).toBeNull();
    expect(axisGuidePickMeshCount(scene)).toBe(6);

    const guides = (await vi.mocked(createAxisGuides).mock.results[0]!
      .value) as { renderers: Record<"ap" | "dv" | "ml", FakeTextRenderer> };
    const texts = Object.values(guides.renderers).flatMap(renderer =>
      renderer.paragraphs.map(paragraph => paragraph.text)
    );
    expect(texts).toEqual(["+AP", "-AP", "+DV", "-DV", "+ML", "-ML"]);
  });

  it("clears the labels and pick meshes when switched off and reuses the loaded renderers when switched back on", async () => {
    const { runtime } = await mountCanvas();
    await setAxisGuidesVisible(true);

    const guides = (await vi.mocked(createAxisGuides).mock.results[0]!
      .value) as AxisGuideApi.AxisGuides & {
      renderers: Record<"ap" | "dv" | "ml", FakeTextRenderer>;
      dispose: ReturnType<typeof vi.fn>;
    };
    const scene = runtime.scene.value!;

    await setAxisGuidesVisible(false);

    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeNull();
    expect(axisGuidePickMeshCount(scene)).toBe(0);
    for (const renderer of Object.values(guides.renderers)) {
      expect(renderer.paragraphs).toHaveLength(0);
      expect(renderer.parent).toBeNull();
    }
    expect(guides.dispose).not.toHaveBeenCalled();

    await setAxisGuidesVisible(true);

    expect(createAxisGuides).toHaveBeenCalledTimes(1);
    expect(scene.getTransformNodeByName("axisGuideRoot_node")).toBeTruthy();
    expect(axisGuidePickMeshCount(scene)).toBe(6);
    expect(
      Object.values(guides.renderers).flatMap(renderer =>
        renderer.paragraphs.map(paragraph => paragraph.text)
      )
    ).toEqual(["+AP", "-AP", "+DV", "-DV", "+ML", "-ML"]);
  });

  it("re-offsets when the experiment's atlas changes", async () => {
    await mountCanvas();
    vi.mocked(setAtlasCenterOffset).mockClear();

    const store = useCurrentExperimentStore();
    store.experiment = buildExperiment(
      "New Experiment",
      makeAtlas({
        name: "allen_human",
        manifest: makeManifest({
          resolutions: [[0.02, 0.02, 0.02]],
          shape: [[100, 100, 100]]
        })
      }),
      [0, 0, 0]
    );
    await flushPromises();
    await flushPromises();

    expect(setAtlasCenterOffset).toHaveBeenCalledWith(
      expect.anything(),
      [1, 1, 1]
    );
  });

  it("offsets by the current atlas center even while terminology rows are still loading", async () => {
    vi.mocked(getTerminologyRows).mockReturnValue(new Promise(() => {}));

    await mountCanvas();
    useCurrentExperimentStore().experiment.atlas = makeAtlas({
      manifest: makeManifest({
        resolutions: [[0.02, 0.02, 0.02]],
        shape: [[100, 100, 100]]
      })
    });
    await flushPromises();

    expect(setAtlasCenterOffset).toHaveBeenCalledWith(
      expect.anything(),
      [1, 1, 1]
    );
  });

  it("does no atlas-derived scene work when an undo leaves the atlas unchanged", async () => {
    await mountCanvas();
    const store = useCurrentExperimentStore();

    store.experiment.name = "Renamed";
    await flushPromises();
    vi.mocked(syncStructuresVisibility).mockClear();
    vi.mocked(setAtlasCenterOffset).mockClear();

    store.undo();
    await flushPromises();

    expect(syncStructuresVisibility).not.toHaveBeenCalled();
    expect(setAtlasCenterOffset).not.toHaveBeenCalled();
  });

  it("applies the camera's inertia from the preferences store", async () => {
    const { runtime } = await mountCanvas();

    expect(runtime.camera.value?.inertia).toBe(0.9);

    usePreferencesStore().cameraInertia = 0.2;
    await flushPromises();

    expect(runtime.camera.value?.inertia).toBe(0.2);
  });

  it("applies the camera's projection from the preferences store", async () => {
    const { runtime } = await mountCanvas();

    expect(applyCameraProjection).toHaveBeenCalledWith(
      runtime.camera.value,
      "perspective"
    );

    usePreferencesStore().cameraProjection = "orthographic";
    await flushPromises();

    expect(applyCameraProjection).toHaveBeenCalledWith(
      runtime.camera.value,
      "orthographic"
    );
  });

  it("scales the camera's clip planes to the atlas and rescales when the atlas changes", async () => {
    const { runtime } = await mountCanvas();

    // DEFAULT_ATLAS is 13.2 x 8 x 11.4 mm.
    expect(runtime.camera.value!.minZ).toBeCloseTo(0.132);
    expect(runtime.camera.value!.maxZ).toBeCloseTo(13200);

    useCurrentExperimentStore().experiment = buildExperiment(
      "New Experiment",
      makeAtlas({
        manifest: makeManifest({
          resolutions: [[0.02, 0.02, 0.02]],
          shape: [[100, 100, 100]]
        })
      }),
      [0, 0, 0]
    );
    await flushPromises();
    await flushPromises();

    expect(runtime.camera.value!.minZ).toBeCloseTo(0.02);
    expect(runtime.camera.value!.maxZ).toBeCloseTo(2000);
  });

  it("re-derives the projection when the camera's view matrix changes", async () => {
    const { runtime } = await mountCanvas();
    vi.mocked(applyCameraProjection).mockClear();

    (
      runtime.camera.value!.onViewMatrixChangedObservable as Observable<unknown>
    ).notifyObservers(undefined);

    expect(applyCameraProjection).toHaveBeenCalledWith(
      runtime.camera.value,
      "perspective"
    );
  });

  it("stays in perspective when the axis-view tracker fires with no preceding double-tap", async () => {
    const { runtime } = await mountCanvas();

    (
      runtime.camera.value!.onAfterCheckInputsObservable as Observable<unknown>
    ).notifyObservers(undefined);

    expect(usePreferencesStore().cameraProjection).toBe("perspective");
  });

  describe("world background color", () => {
    afterEach(() => {
      Dark.set(false);
    });

    it("clears the scene with the light-mode color while dark mode is off", async () => {
      Dark.set(false);
      const { runtime } = await mountCanvas();
      usePreferencesStore().worldBackgroundColorLightMode = "#ff0000";
      await flushPromises();

      expect(runtime.scene.value!.clearColor.toHexString()).toBe("#FF0000FF");
    });

    it("switches to the dark-mode color when dark mode turns on", async () => {
      Dark.set(false);
      const { runtime } = await mountCanvas();
      const preferences = usePreferencesStore();
      preferences.worldBackgroundColorLightMode = "#ff0000";
      preferences.worldBackgroundColorDarkMode = "#0000ff";
      Dark.set(true);
      await flushPromises();

      expect(runtime.scene.value!.clearColor.toHexString()).toBe("#0000FFFF");
    });
  });

  it("resyncs structures with the new atlas when the experiment's atlas changes", async () => {
    await mountCanvas();

    const store = useCurrentExperimentStore();
    const newAtlas = makeAtlas({ name: "allen_human" });
    store.experiment = buildExperiment("New Experiment", newAtlas, [0, 0, 0]);
    await flushPromises();

    expect(syncStructuresVisibility).toHaveBeenCalledWith(
      expect.anything(),
      newAtlas,
      expect.anything(),
      expect.anything()
    );
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

  it("disposes the axis guide text renderers on unmount", async () => {
    const { wrapper } = await mountCanvas();
    await setAxisGuidesVisible(true);

    const guides = (await vi.mocked(createAxisGuides).mock.results[0]!
      .value) as { dispose: () => void };

    wrapper.unmount();

    expect(guides.dispose).toHaveBeenCalledTimes(1);
  });

  it("warns and draws no axis guides when the text renderers fail to load", async () => {
    const { promise, reject } =
      Promise.withResolvers<AxisGuideApi.AxisGuides>();
    vi.mocked(createAxisGuides).mockReturnValue(promise);

    const { wrapper, runtime } = await mountCanvas();
    const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");
    await setAxisGuidesVisible(true);

    reject(new Error("font load failed"));
    await flushPromises();

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning" })
    );
    expect(
      runtime.scene.value!.getTransformNodeByName("axisGuideRoot_node")
    ).toBeNull();
  });

  it("disposes the axis guides and rebuilds them for a replaced scene", async () => {
    const { runtime } = await mountCanvas();
    await setAxisGuidesVisible(true);

    const first = (await vi.mocked(createAxisGuides).mock.results[0]!
      .value) as { dispose: ReturnType<typeof vi.fn> };

    runtime.replaceScene();
    await flushPromises();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(createAxisGuides).toHaveBeenCalledTimes(2);
    expect(createAxisGuides).toHaveBeenLastCalledWith(runtime.scene.value);
    expect(
      runtime.scene.value!.getTransformNodeByName("axisGuideRoot_node")
    ).toBeTruthy();
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

  it("propagates a rotation drag after switching to the rotation gizmo", async () => {
    const { wrapper, runtime } = await mountCanvas();
    const store = useCurrentExperimentStore();

    const contour = [
      [-11, 9989],
      [-11, -11],
      [24, -220],
      [59, -11],
      [59, 9989]
    ];
    const probeInterfaceProbe = makeProbeInterfaceProbe({
      probe_planar_contour: contour
    });
    internProbeInterfaceProbe(store.experiment, probeInterfaceProbe);
    const builtProbe = makeProbe({
      probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe)
    });
    addProbe(store.experiment, builtProbe);
    const probe = store.experiment.probes.find(p => p.id === builtProbe.id)!;
    await flushPromises();
    store.selectedInspectable = probe;
    await flushPromises();

    const modeToggle = wrapper
      .findAllComponents({ name: "QBtnToggle" })
      .find(toggle => toggle.props("modelValue") === "position")!;
    await modeToggle.vm.$emit("update:modelValue", "rotation");
    await flushPromises();

    const scene = runtime.scene.value!;
    const gizmoManager = runtime.gizmoManager.value!;
    const node = getProbeTransformNode(scene, probe.id)!;

    gizmoManager.attachToNode(node);
    node.rotation.set(0.1, 0.2, 0.3);
    gizmoManager.gizmos.rotationGizmo!.onDragObservable.notifyObservers(
      {} as never
    );

    expect(probe.rotation).toEqual(vector3ToAsr(node.rotation));
    expect(store.draggedProbeId).toBe(probe.id);

    gizmoManager.gizmos.rotationGizmo!.onDragEndObservable.notifyObservers(
      {} as never
    );

    expect(store.draggedProbeId).toBeNull();
  });

  it("collapses a full drag-then-release cycle into one undoable step", async () => {
    const { runtime } = await mountCanvas();
    const store = useCurrentExperimentStore();

    const contour = [
      [-11, 9989],
      [-11, -11],
      [24, -220],
      [59, -11],
      [59, 9989]
    ];
    const probeInterfaceProbe = makeProbeInterfaceProbe({
      probe_planar_contour: contour
    });
    internProbeInterfaceProbe(store.experiment, probeInterfaceProbe);
    const builtProbe = makeProbe({
      probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe)
    });
    addProbe(store.experiment, builtProbe);
    const probe = store.experiment.probes.find(p => p.id === builtProbe.id)!;
    await flushPromises();

    const scene = runtime.scene.value!;
    const gizmoManager = runtime.gizmoManager.value!;
    const node = getProbeTransformNode(scene, probe.id)!;
    const positionGizmo = gizmoManager.gizmos.positionGizmo!;

    gizmoManager.attachToNode(node);
    node.position.set(1, 0, 0);
    positionGizmo.onDragObservable.notifyObservers({} as never);
    await flushPromises();
    node.position.set(2, 0, 0);
    positionGizmo.onDragObservable.notifyObservers({} as never);
    await flushPromises();
    positionGizmo.onDragEndObservable.notifyObservers({} as never);
    await flushPromises();
    store.undo();

    const restoredProbe = store.probes.find(p => p.id === builtProbe.id)!;
    expect(restoredProbe.tipPosition).toEqual([0, 0, 0]);
  });

  it("streams the camera's pose live and collapses the movement into one undoable step", async () => {
    const { runtime } = await mountCanvas();
    const store = useCurrentExperimentStore();
    const alphaBefore = store.cameraPose.alpha;

    const camera = runtime.camera.value!;
    camera.alpha = 1.23;
    camera.onAfterCheckInputsObservable.notifyObservers(camera);
    await flushPromises();

    expect(store.cameraPose.alpha).toBe(1.23);
    expect(store.isCameraMoving).toBe(true);

    camera.onAfterCheckInputsObservable.notifyObservers(camera);
    await flushPromises();

    expect(store.isCameraMoving).toBe(false);

    store.undo();

    expect(store.cameraPose.alpha).toBe(alphaBefore);
  });

  it("keeps the position gizmo on the probe in global coordinates", async () => {
    const { wrapper, runtime } = await mountCanvas();
    const store = useCurrentExperimentStore();
    store.selectedInspectable = makeProbe();
    await flushPromises();

    const coordinateSpaceToggle = wrapper
      .findAllComponents({ name: "QBtnToggle" })
      .find(toggle => toggle.props("modelValue") === "local")!;
    await coordinateSpaceToggle.vm.$emit("update:modelValue", "global");
    await flushPromises();

    const gizmoManager = runtime.gizmoManager.value!;

    expect(
      gizmoManager.gizmos.positionGizmo!.updateGizmoPositionToMatchAttachedMesh
    ).toBe(true);
    // `PositionGizmo`'s own `updateGizmoRotationToMatchAttachedMesh` getter
    // does not reflect `coordinatesMode` (Babylon only keeps the per-axis
    // `xGizmo` in sync), so assert on that instead.
    expect(
      gizmoManager.gizmos.positionGizmo!.xGizmo
        .updateGizmoRotationToMatchAttachedMesh
    ).toBe(false);
  });

  it("switches the axis guide labels between global and local coordinate spaces with the gizmo toolbar", async () => {
    const { wrapper } = await mountCanvas();
    const store = useCurrentExperimentStore();
    await setAxisGuidesVisible(true);

    const guides = (await vi.mocked(createAxisGuides).mock.results[0]!
      .value) as { renderers: Record<"ap" | "dv" | "ml", FakeTextRenderer> };
    const labelTexts = () =>
      Object.values(guides.renderers)
        .flatMap(renderer =>
          renderer.paragraphs.map(paragraph => paragraph.text)
        )
        .sort();

    expect(labelTexts()).toEqual(
      ["+AP", "-AP", "+DV", "-DV", "+ML", "-ML"].sort()
    );

    store.selectedInspectable = makeProbe();
    await flushPromises();

    expect(labelTexts()).toEqual(["+X", "-X", "+Y", "-Y", "+Z", "-Z"].sort());

    const coordinateSpaceToggle = wrapper
      .findAllComponents({ name: "QBtnToggle" })
      .find(toggle => toggle.props("modelValue") === "local")!;
    await coordinateSpaceToggle.vm.$emit("update:modelValue", "global");
    await flushPromises();

    expect(labelTexts()).toEqual(
      ["+AP", "-AP", "+DV", "-DV", "+ML", "-ML"].sort()
    );
  });

  it("hides the gizmo toolbar while nothing is selected", async () => {
    const { wrapper } = await mountCanvas();

    expect(wrapper.findAllComponents({ name: "QBtnToggle" })).toHaveLength(0);
  });

  it("hides the gizmo toolbar while the camera is selected", async () => {
    const { wrapper } = await mountCanvas();
    const store = useCurrentExperimentStore();

    store.selectedInspectable = store.experiment.cameraPose;
    await flushPromises();

    expect(wrapper.findAllComponents({ name: "QBtnToggle" })).toHaveLength(0);
  });

  it("shows the gizmo toolbar while a probe is selected and hides it again on deselect", async () => {
    const { wrapper } = await mountCanvas();
    const store = useCurrentExperimentStore();

    store.selectedInspectable = makeProbe();
    await flushPromises();

    expect(wrapper.findAllComponents({ name: "QBtnToggle" })).toHaveLength(2);

    store.selectedInspectable = null;
    await flushPromises();

    expect(wrapper.findAllComponents({ name: "QBtnToggle" })).toHaveLength(0);
  });

  it("offers a scale option only while a scene object is selected, resetting the mode when it stops being scalable", async () => {
    const { wrapper } = await mountCanvas();
    const store = useCurrentExperimentStore();

    store.selectedInspectable = makeProbe();
    await flushPromises();

    const modeToggle = wrapper
      .findAllComponents({ name: "QBtnToggle" })
      .find(toggle => toggle.props("modelValue") === "position")!;
    expect(modeToggle.props("options")).toHaveLength(2);

    store.selectedInspectable = makeSceneObject();
    await flushPromises();

    const options = modeToggle.props("options") as { value: string }[];
    expect(options).toHaveLength(3);
    expect(options[2]).toMatchObject({
      value: "scale",
      icon: "sym_o_pan_zoom"
    });

    await modeToggle.vm.$emit("update:modelValue", "scale");
    await flushPromises();

    store.selectedInspectable = makeProbe();
    await flushPromises();

    expect(modeToggle.props("modelValue")).toBe("position");
  });

  it("drags the body model gizmo without moving the probe, and undoes the release as one step", async () => {
    const { runtime } = await mountCanvas();
    const store = useCurrentExperimentStore();

    const contour = [
      [-11, 9989],
      [-11, -11],
      [24, -220],
      [59, -11],
      [59, 9989]
    ];
    const probeInterfaceProbe = makeProbeInterfaceProbe({
      probe_planar_contour: contour
    });
    internProbeInterfaceProbe(store.experiment, probeInterfaceProbe);
    const builtProbe = makeProbe({
      probeInterfaceIdentifier:
        getProbeInterfaceIdentifier(probeInterfaceProbe),
      bodyModel: makeSceneModel()
    });
    addProbe(store.experiment, builtProbe);
    const probe = store.experiment.probes.find(p => p.id === builtProbe.id)!;
    store.selectedInspectable = probe;
    store.bodyModelGizmoProbeId = probe.id;
    await flushPromises();

    const scene = runtime.scene.value!;
    const gizmoManager = runtime.gizmoManager.value!;
    const probeNode = getProbeTransformNode(scene, probe.id)!;
    const bodyModelNode = new TransformNode(
      `${probe.id}_probe_body-model_node`,
      scene
    );
    bodyModelNode.parent = probeNode;

    gizmoManager.attachToNode(bodyModelNode);
    bodyModelNode.position.set(1, 2, 3);
    gizmoManager.gizmos.positionGizmo!.onDragObservable.notifyObservers(
      {} as never
    );

    expect(probe.bodyModel!.position).toEqual([1, 2, 3]);
    expect(probe.tipPosition).toEqual([0, 0, 0]);
    expect(store.draggedProbeId).toBe(probe.id);

    gizmoManager.gizmos.positionGizmo!.onDragEndObservable.notifyObservers(
      {} as never
    );
    await flushPromises();

    expect(store.draggedProbeId).toBeNull();

    store.undo();

    const restoredProbe = store.probes.find(p => p.id === builtProbe.id)!;
    expect(restoredProbe.bodyModel!.position).toEqual([0, 0, 0]);
  });

  it("offers a scale option while the body model gizmo is attached, resetting the mode on detach", async () => {
    const { wrapper } = await mountCanvas();
    const store = useCurrentExperimentStore();
    const probe = makeProbe({ bodyModel: makeSceneModel() });
    addProbe(store.experiment, probe);
    store.selectedInspectable = probe;
    await flushPromises();

    const modeToggle = wrapper
      .findAllComponents({ name: "QBtnToggle" })
      .find(toggle => toggle.props("modelValue") === "position")!;
    expect(modeToggle.props("options")).toHaveLength(2);

    store.bodyModelGizmoProbeId = probe.id;
    await flushPromises();

    const options = modeToggle.props("options") as { value: string }[];
    expect(options).toHaveLength(3);
    expect(options[2]).toMatchObject({
      value: "scale",
      icon: "sym_o_pan_zoom"
    });

    await modeToggle.vm.$emit("update:modelValue", "scale");
    await flushPromises();

    store.bodyModelGizmoProbeId = null;
    await flushPromises();

    expect(modeToggle.props("modelValue")).toBe("position");
  });

  describe("move to surface", () => {
    /** Add a probe with a real contour, so `syncProbes` builds its shank meshes. */
    async function addTestProbe(
      store: ReturnType<typeof useCurrentExperimentStore>
    ) {
      const contour = [
        [-11, 9989],
        [-11, -11],
        [24, -220],
        [59, -11],
        [59, 9989]
      ];
      const probeInterfaceProbe = makeProbeInterfaceProbe({
        probe_planar_contour: contour
      });
      internProbeInterfaceProbe(store.experiment, probeInterfaceProbe);
      const builtProbe = makeProbe({
        probeInterfaceIdentifier:
          getProbeInterfaceIdentifier(probeInterfaceProbe)
      });
      addProbe(store.experiment, builtProbe);
      await flushPromises();
      return store.experiment.probes.find(p => p.id === builtProbe.id)!;
    }

    it("draws surface-path tubes when a surface-move choice is pending", async () => {
      const { runtime } = await mountCanvas();
      const store = useCurrentExperimentStore();
      const probe = await addTestProbe(store);

      store.probeSurfaceChoice = {
        probeId: probe.id,
        tipPosition: [...probe.tipPosition],
        rotation: [...probe.rotation],
        tipMillimeters: [0, 0, 0],
        axisTargetMillimeters: [1, 0, 0],
        dorsoventralTargetMillimeters: [0, 1, 0]
      };
      await flushPromises();

      expect(buildProbeSurfacePaths).toHaveBeenCalledWith(
        runtime.scene.value,
        store.probeSurfaceChoice
      );
      expect(
        runtime.scene.value!.getMeshByName("probeSurfacePath_axis")
      ).toBeTruthy();
      expect(
        runtime.scene.value!.getMeshByName("probeSurfacePath_dorsoventral")
      ).toBeTruthy();
    });

    it("drops a pending choice and disposes its tubes when the probe moves", async () => {
      const { runtime } = await mountCanvas();
      const store = useCurrentExperimentStore();
      const probe = await addTestProbe(store);

      store.probeSurfaceChoice = {
        probeId: probe.id,
        tipPosition: [...probe.tipPosition],
        rotation: [...probe.rotation],
        tipMillimeters: [0, 0, 0],
        axisTargetMillimeters: [1, 0, 0],
        dorsoventralTargetMillimeters: [0, 1, 0]
      };
      await flushPromises();
      vi.mocked(disposeProbeSurfacePaths).mockClear();

      probe.tipPosition = [1, 2, 3];
      await flushPromises();

      expect(store.probeSurfaceChoice).toBeNull();
      expect(disposeProbeSurfacePaths).toHaveBeenCalledWith(
        runtime.scene.value
      );
      expect(
        runtime.scene.value!.getMeshByName("probeSurfacePath_axis")
      ).toBeNull();
    });

    it("applies the dorsoventral target and clears the choice on a tube tap", async () => {
      const { runtime } = await mountCanvas();
      const store = useCurrentExperimentStore();
      const probe = await addTestProbe(store);
      const referenceCoordinate = store.referenceCoordinate;

      store.probeSurfaceChoice = {
        probeId: probe.id,
        tipPosition: [...probe.tipPosition],
        rotation: [...probe.rotation],
        tipMillimeters: [
          referenceCoordinate[0] + probe.tipPosition[0],
          referenceCoordinate[1] + probe.tipPosition[1],
          referenceCoordinate[2] + probe.tipPosition[2]
        ],
        axisTargetMillimeters: [
          referenceCoordinate[0] + 1,
          referenceCoordinate[1],
          referenceCoordinate[2]
        ],
        dorsoventralTargetMillimeters: [
          referenceCoordinate[0],
          referenceCoordinate[1] + 2,
          referenceCoordinate[2]
        ]
      };
      await flushPromises();

      const scene = runtime.scene.value!;
      const camera = new ArcRotateCamera(
        "surface-pick-camera",
        -Math.PI / 2,
        Math.PI / 8,
        50,
        Vector3.Zero(),
        scene
      );
      scene.activeCamera = camera;
      const atlasRoot = buildAtlasRootNode(scene);
      atlasRoot.computeWorldMatrix(true);
      const transform = camera
        .getViewMatrix()
        .multiply(camera.getProjectionMatrix());
      const engine = scene.getEngine();
      const viewport = camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight()
      );
      // `CreateTube` bakes the path into the vertex buffer rather than the
      // mesh's own transform, and the tube is parented under the atlas
      // root (which carries its own 180-degree flip) - project the
      // midpoint through the atlas root's world matrix, not the raw ASR
      // millimeters or `mesh.absolutePosition` (just the mesh's origin).
      const midMillimeters: [number, number, number] = [
        (store.probeSurfaceChoice!.tipMillimeters[0] +
          store.probeSurfaceChoice!.dorsoventralTargetMillimeters[0]) /
          2,
        (store.probeSurfaceChoice!.tipMillimeters[1] +
          store.probeSurfaceChoice!.dorsoventralTargetMillimeters[1]) /
          2,
        (store.probeSurfaceChoice!.tipMillimeters[2] +
          store.probeSurfaceChoice!.dorsoventralTargetMillimeters[2]) /
          2
      ];
      const midWorld = Vector3.TransformCoordinates(
        asrToVector3(midMillimeters),
        atlasRoot.getWorldMatrix()
      );
      const screen = Vector3.Project(
        midWorld,
        Matrix.Identity(),
        transform,
        viewport
      );
      scene.pointerX = screen.x;
      scene.pointerY = screen.y;

      scene.onPointerObservable.notifyObservers(
        new PointerInfo(
          PointerEventTypes.POINTERTAP,
          {} as PointerEvent,
          {} as PickingInfo
        ),
        PointerEventTypes.POINTERTAP
      );
      await flushPromises();

      expect(probe.tipPosition).toEqual([0, 2, 0]);
      expect(store.probeSurfaceChoice).toBeNull();
    });
  });
});
