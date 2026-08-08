import {
  type ComponentMountingOptions,
  mount,
  type VueWrapper
} from "@vue/test-utils";
import type { Component } from "vue";
import { Dialog, Notify, Quasar } from "quasar";
import { createI18n } from "vue-i18n";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import type { IMatrixLike, Matrix } from "@babylonjs/core";
import {
  DracoDecoder,
  GizmoManager,
  HavokPlugin,
  InitializeCSG2Async,
  IsCSG2Ready,
  MeshBuilder,
  NullEngine,
  Scene,
  SelectionOutlineLayer,
  UtilityLayerRenderer,
  Vector3,
  WorkerPool
} from "@babylonjs/core";
import { GLTF2Export } from "@babylonjs/serializers/glTF/2.0";
import type { INodeLike, ParagraphOptions } from "@babylonjs/addons";
import { FontAsset } from "@babylonjs/addons";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
 * Build a `File` holding a GLB of the given geometry, for tests that import a scene model.
 * @param fileName Name the returned file carries.
 * @param buildGeometry Builds the geometry to export; defaults to a unit box.
 */
export async function makeTestModelFile(
  fileName = "box.glb",
  buildGeometry: (scene: Scene) => void = scene => {
    MeshBuilder.CreateBox("box", { size: 1 }, scene);
  }
): Promise<File> {
  const scene = makeTestScene();
  try {
    buildGeometry(scene);
    const data = await GLTF2Export.GLBAsync(scene, "box.glb", {
      exportWithoutWaitingForScene: true
    });
    const glb = Object.values(data.files).find(value => value instanceof Blob);
    return new File([await (glb as Blob).arrayBuffer()], fileName, {
      type: "model/gltf-binary"
    });
  } finally {
    scene.dispose();
  }
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

/** Initialized Havok wasm module, reused across test scenes. */
let testHavokInstance: HavokPhysicsWithBindings | null = null;

/**
 * Build a real Babylon `Scene` with Havok physics V2 enabled, plus the `GizmoManager` and
 * `SelectionOutlineLayer` `buildProbe` requires, for probe collision tests.
 */
export async function makeTestSceneWithPhysics(): Promise<{
  scene: Scene;
  gizmoManager: GizmoManager;
  selectionOutlineLayer: SelectionOutlineLayer;
  havokPlugin: HavokPlugin;
}> {
  const { scene, gizmoManager, selectionOutlineLayer } =
    makeTestSceneWithGizmo();

  if (!testHavokInstance) {
    const require = createRequire(import.meta.url);
    const wasmPath = join(
      dirname(require.resolve("@babylonjs/havok")),
      "HavokPhysics.wasm"
    );
    const wasmBuffer = readFileSync(wasmPath);
    testHavokInstance = await HavokPhysics({
      wasmBinary: wasmBuffer.buffer.slice(
        wasmBuffer.byteOffset,
        wasmBuffer.byteOffset + wasmBuffer.byteLength
      ) as ArrayBuffer
    });
  }

  const havokPlugin = new HavokPlugin(true, testHavokInstance);
  scene.enablePhysics(Vector3.Zero(), havokPlugin);

  return { scene, gizmoManager, selectionOutlineLayer, havokPlugin };
}

/**
 * Step the scene's physics engine once, for tests that need collision events without rendering.
 * @param scene Scene whose physics engine to step.
 * @param deltaSeconds Simulation step, in seconds.
 */
export function stepPhysics(scene: Scene, deltaSeconds: number): void {
  // Bypasses a full `scene.render()`, which would also need a real render loop.
  scene.getPhysicsEngine()?._step(deltaSeconds);
}

/**
 * Build a real Babylon `Scene`, `GizmoManager` (all three gizmos enabled), and
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
  gizmoManager.scaleGizmoEnabled = true;
  const selectionOutlineLayer = new SelectionOutlineLayer(
    "selection_outline_layer",
    scene
  );

  return { scene, gizmoManager, selectionOutlineLayer };
}

/**
 * Drive one frame of a test scene's `onBeforeRenderObservable` at a fixed
 * delta, for animations reading the engine's delta time.
 * @param scene Scene to tick.
 * @param deltaMilliseconds Frame delta the engine reports for this tick.
 */
export function tickScene(scene: Scene, deltaMilliseconds: number): void {
  scene.getEngine().getDeltaTime = () => deltaMilliseconds;
  scene.onBeforeRenderObservable.notifyObservers(scene);
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
        [Quasar, { plugins: { Dialog, Notify } }],
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

/** Paragraph recorded by `makeFakeTextRenderer`. */
export interface RecordedParagraph {
  text: string;
  worldMatrix: Matrix;
}

/** Fake MSDF text renderer, recording the paragraphs added to it. */
export interface FakeTextRenderer {
  parent: INodeLike | null;
  paragraphs: RecordedParagraph[];
  addParagraph(
    text: string,
    options?: Partial<ParagraphOptions>,
    worldMatrix?: IMatrixLike
  ): void;
  clearParagraphs(): void;
}

/** Build a `FakeTextRenderer`, recording the paragraphs added to it. */
export function makeFakeTextRenderer(): FakeTextRenderer {
  const paragraphs: RecordedParagraph[] = [];
  return {
    parent: null,
    paragraphs,
    addParagraph(
      text: string,
      _options?: Partial<ParagraphOptions>,
      worldMatrix?: IMatrixLike
    ) {
      paragraphs.push({ text, worldMatrix: worldMatrix as Matrix });
    },
    clearParagraphs() {
      paragraphs.length = 0;
    }
  };
}

/**
 * Build a real `FontAsset` from a minimal MSDF definition: em size 100, every
 * glyph 50 units wide with a 50-unit advance, so each three-character axis
 * label lays out exactly 1.52 em wide.
 * @param scene Scene hosting the font's atlas texture.
 */
export function makeTestFontAsset(scene: Scene): FontAsset {
  const chars = ["+", "-", "A", "P", "D", "V", "M", "L"].map((char, index) => ({
    id: char.charCodeAt(0),
    index,
    char,
    width: 50,
    height: 60,
    xoffset: 0,
    yoffset: 10,
    xadvance: 50,
    chnl: 15,
    x: index * 50,
    y: 0,
    page: 0
  }));

  return new FontAsset(
    JSON.stringify({
      pages: ["fixture.png"],
      chars,
      info: { face: "Fixture", size: 100 },
      common: { lineHeight: 100, base: 80, scaleW: 512, scaleH: 512, pages: 1 },
      distanceField: { fieldType: "msdf", distanceRange: 4 },
      kernings: []
    }),
    "fixture.png",
    scene
  );
}
