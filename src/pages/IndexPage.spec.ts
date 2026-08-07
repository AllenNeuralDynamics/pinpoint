import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import IndexPage from "./IndexPage.vue";
import { createWrapperRegistry, mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";
import { makeProbe, makeSceneModel, makeSceneObject } from "@/test/fixtures";
import { pruneSceneModels } from "@/features/scene";
import { SplashDialog } from "@/features/splash";

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
        currentSceneObject.id,
        currentProbe.bodyModel!.id,
        recentSceneObject.id,
        recentProbe.bodyModel!.id
      ])
    );
  });
});
