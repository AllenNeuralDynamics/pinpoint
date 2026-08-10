import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import IndexPage from "./IndexPage.vue";
import {
  createWrapperRegistry,
  flushMicrotasks,
  mountWithQuasar
} from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";
import { makeProbe, makeSceneModel, makeSceneObject } from "@/test/fixtures";
import { pruneSceneModels, SceneHierarchy } from "@/features/scene";
import { SplashDialog } from "@/features/splash";
import { ChannelMaps } from "@/features/slice";

// The splash dialog opens in `onMounted`, before a mounted wrapper's
// `$q.dialog` can be stubbed. Replace Quasar's `Dialog` plugin instead --
// `mountWithQuasar` installs it, and Quasar's installer calls
// `Plugin.install({ $q })`, so this owns `$q.dialog` from the first render.
const { dialogSpy } = vi.hoisted(() => ({ dialogSpy: vi.fn() }));

vi.mock("quasar", async importOriginal => {
  const actual = await importOriginal<typeof import("quasar")>();
  return {
    ...actual,
    Dialog: {
      install: ({ $q }: { $q: { dialog: unknown } }) => {
        $q.dialog = dialogSpy;
      }
    }
  };
});

// Mock the leaf module (not the `@/features/atlas` barrel) -- the store's
// `terminologyRows` is a `computedAsync` and fetches on store creation, so
// mounting would trigger real network calls otherwise.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

// Mock the leaf module the `@/features/scene` barrel re-exports, not the
// barrel itself.
vi.mock("@/features/scene/api/scene-model.api", () => ({
  pruneSceneModels: vi.fn().mockResolvedValue([])
}));

const wrappers = createWrapperRegistry();
const menuBarWrappers = createWrapperRegistry<VueWrapper>();

/**
 * Dispatch a physical Ctrl/Cmd+Z keydown on the given target, or `window` by
 * default.
 * @param options Shift modifier and dispatch target.
 */
function pressUndoRedoKey(
  options: { shift?: boolean; target?: EventTarget } = {}
) {
  const { shift = false, target = window } = options;
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      code: "KeyZ",
      ctrlKey: true,
      shiftKey: shift,
      cancelable: true,
      bubbles: true
    })
  );
}

describe("IndexPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(pruneSceneModels).mockClear();
    dialogSpy.mockClear();
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  it("undoes the current experiment on Ctrl/Cmd+Z", async () => {
    wrappers.track(mountWithQuasar(IndexPage, { shallow: true }));
    const store = useCurrentExperimentStore();
    const defaultName = store.name;
    store.experiment.name = "Renamed";
    await nextTick();

    pressUndoRedoKey();

    expect(store.name).toBe(defaultName);
  });

  it("opens the splash dialog on mount by default", () => {
    wrappers.track(mountWithQuasar(IndexPage, { shallow: true }));

    expect(dialogSpy).toHaveBeenCalledWith({ component: SplashDialog });
  });

  it("does not open the splash dialog when it is skipped", () => {
    const pinia = createPinia();
    usePreferencesStore(pinia).isSplashScreenSkipped = true;

    wrappers.track(mountWithQuasar(IndexPage, { shallow: true, pinia }));

    expect(dialogSpy).not.toHaveBeenCalled();
  });

  it("redoes the current experiment on Ctrl/Cmd+Shift+Z", async () => {
    wrappers.track(mountWithQuasar(IndexPage, { shallow: true }));
    const store = useCurrentExperimentStore();
    const defaultName = store.name;
    store.experiment.name = "Renamed";
    await nextTick();
    pressUndoRedoKey();
    expect(store.name).toBe(defaultName);

    pressUndoRedoKey({ shift: true });

    expect(store.name).toBe("Renamed");
  });

  it("does not undo when an editable element is focused", async () => {
    wrappers.track(mountWithQuasar(IndexPage, { shallow: true }));
    const store = useCurrentExperimentStore();
    store.experiment.name = "Renamed";
    await nextTick();

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    pressUndoRedoKey({ target: input });
    input.remove();

    expect(store.name).toBe("Renamed");
  });

  it("sweeps unreferenced scene object and probe body models on unmount", async () => {
    const wrapper = mountWithQuasar(IndexPage, { shallow: true });
    const currentExperimentStore = useCurrentExperimentStore();
    const recentExperimentsStore = useRecentExperimentsStore();
    const currentSceneObject = makeSceneObject();
    const currentProbe = makeProbe({ bodyModel: makeSceneModel() });
    currentExperimentStore.experiment.sceneObjects = [currentSceneObject];
    currentExperimentStore.experiment.probes = [currentProbe];
    const recentSceneObject = makeSceneObject();
    const recentProbe = makeProbe({ bodyModel: makeSceneModel() });
    recentExperimentsStore.recents = [
      {
        ...currentExperimentStore.experiment,
        sceneObjects: [recentSceneObject],
        probes: [recentProbe]
      }
    ];
    await nextTick();

    wrapper.unmount();

    expect(pruneSceneModels).toHaveBeenCalledTimes(1);
    expect(new Set(vi.mocked(pruneSceneModels).mock.calls[0]![0])).toEqual(
      new Set([
        currentSceneObject.modelId,
        currentProbe.bodyModel!.modelId,
        recentSceneObject.modelId,
        recentProbe.bodyModel!.modelId
      ])
    );
  });
});

describe("IndexPage menu bar", () => {
  /** Mount `IndexPage` with its heavy feature panels stubbed out. */
  function mountIndexPage() {
    return menuBarWrappers.track(
      mountWithQuasar(IndexPage, {
        attachTo: document.body,
        global: {
          stubs: {
            SceneCanvas: true,
            SceneHierarchy: true,
            Inspector: true,
            AtlasHierarchy: true,
            ChannelMaps: true
          }
        }
      })
    );
  }

  /** Find a top-level toolbar button by its exact visible label. */
  function toolbarButton(
    wrapper: VueWrapper,
    label: string
  ): HTMLButtonElement {
    const toolbar = wrapper.get(".q-toolbar").element;
    return [...toolbar.querySelectorAll("button")].find(
      button => button.textContent?.trim() === label
    ) as HTMLButtonElement;
  }

  /** Dispatch a bubbling `mouseenter` on an element. */
  function hover(element: HTMLElement) {
    element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  }

  afterEach(() => {
    menuBarWrappers.unmountAll();
  });

  it("shows the Scene panel by default", () => {
    const wrapper = mountIndexPage();

    expect(wrapper.findComponent(SceneHierarchy).exists()).toBe(true);
    expect(wrapper.findComponent(ChannelMaps).exists()).toBe(false);
  });

  it("switches to the Edit menu when hovering it while the File menu is open", async () => {
    const wrapper = mountIndexPage();

    toolbarButton(wrapper, "File").click();
    await flushMicrotasks();
    expect(document.body.textContent).toContain("Open Recent");

    hover(toolbarButton(wrapper, "Edit"));
    await flushMicrotasks();

    expect(document.body.textContent).not.toContain("Open Recent");
    expect(document.body.textContent).toContain("Undo");
  });

  it("switches back to the File menu when hovering it while the Edit menu is open", async () => {
    const wrapper = mountIndexPage();

    toolbarButton(wrapper, "File").click();
    await flushMicrotasks();
    hover(toolbarButton(wrapper, "Edit"));
    await flushMicrotasks();

    hover(toolbarButton(wrapper, "File"));
    await flushMicrotasks();

    expect(document.body.textContent).toContain("Open Recent");
    expect(document.body.textContent).not.toContain("Undo");
  });

  it("does not open a menu on hover while no menu is open", async () => {
    const wrapper = mountIndexPage();

    hover(toolbarButton(wrapper, "Edit"));
    await flushMicrotasks();

    expect(document.body.textContent).not.toContain("Undo");
  });

  it("opens the docs in a new tab from the Help button", () => {
    const wrapper = mountIndexPage();

    const help = [
      ...wrapper.get(".q-toolbar").element.querySelectorAll("a")
    ].find(anchor => anchor.textContent?.trim() === "Help");

    expect(help?.getAttribute("href")).toBe(`${import.meta.env.BASE_URL}docs/`);
    expect(help?.getAttribute("target")).toBe("_blank");
    expect(help?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
