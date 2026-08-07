import type { InjectionKey } from "vue";
import { markRaw, shallowReadonly, type ShallowRef, shallowRef } from "vue";
import {
  ArcRotateCamera,
  Engine,
  GizmoManager,
  HavokPlugin,
  HemisphericLight,
  HighlightLayer,
  InitializeCSG2Async,
  IsCSG2Ready,
  Scene,
  SelectionOutlineLayer,
  Vector3
} from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import Module from "manifold-3d";

/**
 * Service holding the Babylon engine, scene, camera, and gizmo manager
 * references for one runtime.
 */
export interface BabylonRuntimeService {
  engine: Readonly<ShallowRef<Engine | null>>;
  scene: Readonly<ShallowRef<Scene | null>>;
  camera: Readonly<ShallowRef<ArcRotateCamera | null>>;
  gizmoManager: Readonly<ShallowRef<GizmoManager | null>>;
  selectionOutlineLayer: Readonly<ShallowRef<SelectionOutlineLayer | null>>;
  havokPlugin: Readonly<ShallowRef<HavokPlugin | null>>;
  highlightLayer: Readonly<ShallowRef<HighlightLayer | null>>;
  init: (canvas: HTMLCanvasElement) => Promise<void>;
  dispose: () => void;
}

export const BabylonRuntimeServiceKey: InjectionKey<BabylonRuntimeService> =
  Symbol("BabylonRuntimeService");

/**
 * Initialize Babylon's CSG2 from the bundled `manifold-3d` package, so its
 * wasm loads from this app's own origin instead of Babylon's default CDN.
 */
async function initializeCSG2(): Promise<void> {
  if (IsCSG2Ready()) return;

  const manifold = await Module();
  manifold.setup();
  await InitializeCSG2Async({
    manifoldInstance: manifold.Manifold,
    manifoldMeshInstance: manifold.Mesh
  });
}

/** Initialized Havok wasm module, reused across runtime re-initializations. */
let havokInstance: HavokPhysicsWithBindings | null = null;

/**
 * Initialize the Havok wasm module from the bundled `@babylonjs/havok` package, reusing the
 * instance across runtimes.
 */
async function initializeHavok(): Promise<HavokPhysicsWithBindings> {
  havokInstance ??= await HavokPhysics({ locateFile: () => havokWasmUrl });
  return havokInstance;
}

/**
 * Create a service holding the Babylon engine, scene, camera, and gizmo
 * manager references for one runtime.
 */
export function createBabylonRuntimeService(): BabylonRuntimeService {
  const engine = shallowRef<Engine | null>(null);
  const scene = shallowRef<Scene | null>(null);
  const camera = shallowRef<ArcRotateCamera | null>(null);
  const gizmoManager = shallowRef<GizmoManager | null>(null);
  const selectionOutlineLayer = shallowRef<SelectionOutlineLayer | null>(null);
  const havokPlugin = shallowRef<HavokPlugin | null>(null);
  const highlightLayer = shallowRef<HighlightLayer | null>(null);

  /**
   * Create the runtime from a canvas. Does nothing if already initialized.
   * @param canvas HTML canvas to attach the runtime to.
   */
  async function init(canvas: HTMLCanvasElement) {
    if (engine.value) return;

    // Setup engine and CSG2.
    const e = markRaw(new Engine(canvas));
    await initializeCSG2();

    // Setup scene.
    const s = markRaw(new Scene(e));

    // Babylon cancels the canvas `pointerdown` by default, which suppresses the
    // compatibility `mousedown` the browser would fire next. Quasar dismisses
    // its popups from a document-level `mousedown` listener, so cancelling it
    // leaves an open menu stuck open when the canvas is clicked.
    s.preventDefaultOnPointerDown = false;

    // Physics V2 drives probe collision detection only; gravity would serve no
    // purpose here and every probe body is animated, so keep the world at rest.
    const hk = new HavokPlugin(true, await initializeHavok());
    s.enablePhysics(Vector3.Zero(), hk);

    // Setup camera.
    const c = new ArcRotateCamera(
      "main_camera",
      -Math.PI / 2,
      Math.PI / 8,
      0,
      Vector3.Zero(),
      s
    );
    c.attachControl(canvas, true);

    // Setup gizmo manager. Babylon builds each gizmo on its first enable and
    // leaves `gizmos.positionGizmo` / `gizmos.rotationGizmo` / `gizmos.scaleGizmo`
    // null until then, so enable all three here: consumers register drag observers
    // on those instances once and switch modes by toggling the enabled flags, which
    // only detach.
    const gm = new GizmoManager(s);
    gm.positionGizmoEnabled = true;
    gm.rotationGizmoEnabled = true;
    gm.scaleGizmoEnabled = true;

    new HemisphericLight("main_light", Vector3.Up(), s);

    const sol = new SelectionOutlineLayer("selection_outline_layer", s);
    const hl = new HighlightLayer("probe_collision_highlight_layer", s);

    e.runRenderLoop(() => {
      s.render();
    });

    engine.value = e;
    scene.value = s;
    camera.value = c;
    gizmoManager.value = gm;
    selectionOutlineLayer.value = sol;
    havokPlugin.value = hk;
    highlightLayer.value = hl;
  }

  /**
   * Cleanup this runtime.
   */
  function dispose() {
    highlightLayer.value?.dispose();
    selectionOutlineLayer.value?.dispose();
    gizmoManager.value?.dispose();
    camera.value?.dispose();
    scene.value?.dispose();
    engine.value?.dispose();

    selectionOutlineLayer.value = null;
    havokPlugin.value = null;
    highlightLayer.value = null;
    gizmoManager.value = null;
    camera.value = null;
    scene.value = null;
    engine.value = null;
  }

  return {
    engine: shallowReadonly(engine),
    scene: shallowReadonly(scene),
    camera: shallowReadonly(camera),
    gizmoManager: shallowReadonly(gizmoManager),
    selectionOutlineLayer: shallowReadonly(selectionOutlineLayer),
    havokPlugin: shallowReadonly(havokPlugin),
    highlightLayer: shallowReadonly(highlightLayer),
    init,
    dispose
  };
}
