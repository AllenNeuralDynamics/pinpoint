import {
  type ComponentMountingOptions,
  mount,
  type VueWrapper
} from "@vue/test-utils";
import type { Component } from "vue";
import { Notify, Quasar } from "quasar";
import { createI18n } from "vue-i18n";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import {
  DracoDecoder,
  GizmoManager,
  InitializeCSG2Async,
  IsCSG2Ready,
  NullEngine,
  Scene,
  SelectionOutlineLayer,
  UtilityLayerRenderer,
  WorkerPool
} from "@babylonjs/core";
import Module from "manifold-3d";
import messages from "@/i18n";

/**
 * Minimal i18n instance backed by the app's real `en-US` messages, so
 * components using `$t(...)` render actual copy instead of raw keys.
 */
function createTestI18n() {
  return createI18n({
    locale: "en-US",
    legacy: false,
    messages
  });
}

/**
 * Build a real Babylon `Scene` backed by a `NullEngine`, for tests that need
 * actual mesh geometry without a real GPU context.
 */
export function makeTestScene(): Scene {
  return new Scene(new NullEngine());
}

/**
 * Initialize Babylon's CSG2 from the bundled `manifold-3d` package.
 */
export async function initializeTestCSG2(): Promise<void> {
  if (IsCSG2Ready()) return;

  const manifold = await Module();
  manifold.setup();
  await InitializeCSG2Async({
    manifoldInstance: manifold.Manifold,
    manifoldMeshInstance: manifold.Mesh
  });
}

/**
 * Build a real Babylon `Scene`, `GizmoManager` (both gizmos enabled), and
 * `SelectionOutlineLayer`, for tests exercising probe gizmo attachment.
 */
export function makeTestSceneWithGizmo(): {
  scene: Scene;
  gizmoManager: GizmoManager;
  selectionOutlineLayer: SelectionOutlineLayer;
} {
  const scene = makeTestScene();
  const gizmoManager = new GizmoManager(
    scene,
    1,
    new UtilityLayerRenderer(scene),
    new UtilityLayerRenderer(scene)
  );
  gizmoManager.positionGizmoEnabled = true;
  gizmoManager.rotationGizmoEnabled = true;
  const selectionOutlineLayer = new SelectionOutlineLayer(
    "selection_outline_layer",
    scene
  );

  return { scene, gizmoManager, selectionOutlineLayer };
}

/**
 * Short-circuit `DracoDecoder`'s lazy worker pool construction with an
 * empty pool, so it never fetches the real wasm from a CDN.
 */
export function stubDracoDecoder(): void {
  DracoDecoder.ResetDefault(true);
  DracoDecoder.DefaultConfiguration = { workerPool: new WorkerPool([]) };
}

/**
 * Mount a component wired up with the same global plugins the real app
 * installs (Quasar, vue-i18n, Pinia).
 * @param component Component to mount.
 * @param options Mounting options, plus an optional `pinia` instance.
 */
export function mountWithQuasar<T extends Component>(
  component: T,
  options: ComponentMountingOptions<T> & { pinia?: Pinia } = {}
) {
  const { pinia = createPinia(), ...mountOptions } = options;
  setActivePinia(pinia);

  return mount(component, {
    ...mountOptions,
    global: {
      ...mountOptions.global,
      // Spread after `...mountOptions.global` so a caller's own
      // `global.plugins` is merged in rather than clobbering this array.
      plugins: [
        [Quasar, { plugins: { Notify } }],
        createTestI18n(),
        pinia,
        ...(mountOptions.global?.plugins ?? [])
      ]
    }
  });
}

/**
 * Mount a Quasar dialog component, attached to `document.body` so its
 * teleported content is queryable, and call its exposed `show()`.
 * @param component Dialog component to mount.
 * @param options Mounting options, plus an optional `pinia` instance.
 */
export async function mountDialogWithQuasar<T extends Component>(
  component: T,
  options: ComponentMountingOptions<T> & { pinia?: Pinia } = {}
): Promise<VueWrapper<{ show(): void }>> {
  const wrapper = mountWithQuasar(component, {
    ...options,
    attachTo: options.attachTo ?? document.body
  }) as unknown as VueWrapper<{ show(): void }>;

  wrapper.vm.show();
  await wrapper.vm.$nextTick();
  return wrapper;
}

/**
 * Track mounted wrappers so they can all be unmounted together, e.g. from
 * an `afterEach`.
 */
export function createWrapperRegistry<T extends { unmount(): void }>(): {
  track(wrapper: T): T;
  unmountAll(): void;
} {
  const wrappers: T[] = [];
  return {
    track(wrapper: T): T {
      wrappers.push(wrapper);
      return wrapper;
    },
    unmountAll(): void {
      wrappers.splice(0).forEach(wrapper => wrapper.unmount());
    }
  };
}

/** Resolve after the current microtask queue drains. */
export async function flushMicrotasks(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}
