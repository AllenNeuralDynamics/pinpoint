import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { ArcRotateCamera } from "@babylonjs/core";
import { NullEngine, Scene } from "@babylonjs/core";
import { shallowRef } from "vue";
import SceneCanvas from "./SceneCanvas.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  removeAllStructures,
  setAtlasRootReference,
  syncStructureVisibility
} from "../api/entity-loader.api";
import { setInitialZoom } from "../api/camera.api";
import {
  getManifest,
  getTerminologyRows,
  structureEntityFromIdentifier
} from "@/features/atlas";
import { BabylonRuntimeServiceKey } from "@/services/babylon-runtime.service";
import type { BabylonRuntimeService } from "@/services/babylon-runtime.service";
import { makeAtlas, makeManifest, makeTerminologyRows } from "@/test/fixtures";

vi.mock("../api/entity-loader.api", async () => {
  const actual = await vi.importActual<
    typeof import("../api/entity-loader.api")
  >("../api/entity-loader.api");
  return {
    ...actual,
    syncStructureVisibility: vi.fn(),
    setAtlasRootReference: vi.fn(),
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
    structureEntityFromIdentifier: vi.fn()
  };
});

type CanvasWrapper = VueWrapper<InstanceType<typeof SceneCanvas>>;

// Mounted wrappers aren't teleported, but SceneCanvas's `onUnmounted` disposes
// the runtime, and stray unresolved `watchEffect`s from a prior test could
// otherwise fire against the next test's mocks -- unmount explicitly.
const mountedWrappers: CanvasWrapper[] = [];

/**
 * Build a `BabylonRuntimeService`-shaped stub whose `init` synchronously
 * assigns a real `NullEngine`-backed `Scene` and a bare camera object, so
 * `SceneCanvas`'s `watchEffect`s have something to react to without a real
 * WebGPU context.
 */
function makeRuntimeStub() {
  const engine = shallowRef<{ resize: () => void } | null>(null);
  const scene = shallowRef<Scene | null>(null);
  const camera = shallowRef<ArcRotateCamera | null>(null);
  const resize = vi.fn();
  const dispose = vi.fn();

  const init = vi.fn(async () => {
    engine.value = { resize };
    scene.value = new Scene(new NullEngine());
    camera.value = { radius: 0 } as ArcRotateCamera;
  });

  return {
    engine,
    scene,
    camera,
    gizmoManager: shallowRef(null),
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
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getManifest).mockReset();
    vi.mocked(getManifest).mockResolvedValue(makeManifest());
    vi.mocked(getTerminologyRows).mockReset();
    vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());
    vi.mocked(structureEntityFromIdentifier).mockReset();
    vi.mocked(structureEntityFromIdentifier).mockReturnValue(null);
    vi.mocked(syncStructureVisibility).mockReset();
    vi.mocked(syncStructureVisibility).mockResolvedValue(undefined);
    vi.mocked(setAtlasRootReference).mockReset();
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

    // `structureEntityFromIdentifier`'s signature changed from taking the
    // atlas to taking the manifest -- assert the manifest itself was passed,
    // not `manifest.atlas`.
    expect(structureEntityFromIdentifier).toHaveBeenCalledWith(
      manifest,
      terminologyRows,
      expect.any(Number)
    );
    expect(syncStructureVisibility).toHaveBeenCalled();
  });

  it("syncs empty structure lists while the atlas components are still evaluating", async () => {
    // Never resolves, so `isManifestEvaluating` (and therefore
    // `areAtlasComponentsEvaluating`) stays true throughout.
    vi.mocked(getManifest).mockReturnValue(new Promise(() => {}));

    await mountCanvas();

    expect(syncStructureVisibility).toHaveBeenCalledWith(
      expect.anything(),
      [],
      []
    );
    expect(structureEntityFromIdentifier).not.toHaveBeenCalled();
  });

  it("shows the loading bar while a sync is in flight and hides it after", async () => {
    let resolveSync!: () => void;
    vi.mocked(syncStructureVisibility).mockReturnValue(
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
    vi.mocked(syncStructureVisibility).mockReturnValue(
      new Promise((_, reject) => (rejectSync = reject))
    );

    const { wrapper } = await mountCanvas();
    const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

    rejectSync(new Error("mesh load failed"));
    await flushPromises();

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ color: "negative" })
    );
    expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
      false
    );
  });

  it("sets the atlas root reference from the experiment's reference coordinate", async () => {
    await mountCanvas();

    const store = useCurrentExperimentStore();
    expect(setAtlasRootReference).toHaveBeenCalledWith(
      expect.anything(),
      store.referenceCoordinate
    );
  });

  it("re-sets the atlas root reference when it changes", async () => {
    await mountCanvas();
    vi.mocked(setAtlasRootReference).mockClear();

    const store = useCurrentExperimentStore();
    store.setReferenceCoordinate([1, 2, 3]);
    await flushPromises();

    expect(setAtlasRootReference).toHaveBeenCalledWith(
      expect.anything(),
      [1, 2, 3]
    );
  });

  it("sets the camera's initial zoom from the manifest once it resolves", async () => {
    const manifest = makeManifest();
    vi.mocked(getManifest).mockResolvedValue(manifest);

    const { runtime } = await mountCanvas();

    expect(setInitialZoom).toHaveBeenCalledWith(manifest, runtime.camera.value);
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
    store.create(
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
});
