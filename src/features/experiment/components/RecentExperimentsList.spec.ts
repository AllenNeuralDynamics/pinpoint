import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import type { VueWrapper } from "@vue/test-utils";
import RecentExperimentsList from "./RecentExperimentsList.vue";
import { createWrapperRegistry, mountWithQuasar } from "@/test/mount-helper";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { buildExperiment } from "../api/experiment.api";
import { makeAtlas } from "@/test/fixtures";

// The current-experiment store's `manifest`/`terminologyRows` are
// `computedAsync` and fetch on store creation, so mounting would trigger real
// network calls otherwise. Mock the leaf module, not the `@/features/atlas`
// barrel.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return { ...actual, getManifest: vi.fn(), getTerminologyRows: vi.fn() };
});

/**
 * `QVirtualScroll` only renders the rows that fit its measured scroll
 * height, which is always 0 in happy-dom - so its default slot never runs
 * in tests. Stub it with something that renders every item's slot content
 * unconditionally.
 */
const QVirtualScrollStub = defineComponent({
  name: "QVirtualScrollStub",
  props: ["items"],
  setup(props, { slots }) {
    return () =>
      h(
        "div",
        (props.items as unknown[]).map((item, index) =>
          slots.default?.({ item, index })
        )
      );
  }
});

const wrappers = createWrapperRegistry<VueWrapper>();

let pinia: Pinia;

function mountList() {
  return wrappers.track(
    mountWithQuasar(RecentExperimentsList, {
      pinia,
      global: { stubs: { QVirtualScroll: QVirtualScrollStub } }
    })
  );
}

describe("RecentExperimentsList", () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  it("shows the empty-state hint when there are no recents", () => {
    const wrapper = mountList();

    expect(wrapper.text()).toContain("No recent experiments.");
  });

  it("renders one row per recent experiment", () => {
    const recentExperimentsStore = useRecentExperimentsStore();
    recentExperimentsStore.add(
      buildExperiment("Experiment A", makeAtlas(), [0, 0, 0])
    );
    recentExperimentsStore.add(
      buildExperiment("Experiment B", makeAtlas(), [0, 0, 0])
    );

    const wrapper = mountList();
    const items = wrapper.findAllComponents({ name: "QItem" });

    expect(items.map(item => item.text())).toEqual([
      expect.stringContaining("Experiment B"),
      expect.stringContaining("Experiment A")
    ]);
  });

  it("removes and loads the experiment when a row is clicked, then emits opened", async () => {
    const recentExperimentsStore = useRecentExperimentsStore();
    const currentExperimentStore = useCurrentExperimentStore();
    const experiment = buildExperiment("Experiment A", makeAtlas(), [0, 0, 0]);
    recentExperimentsStore.add(experiment);

    const wrapper = mountList();
    await wrapper.findComponent({ name: "QItem" }).trigger("click");

    expect(recentExperimentsStore.recents).not.toContain(experiment);
    expect(currentExperimentStore.experiment).toEqual(experiment);
    expect(wrapper.emitted("opened")).toBeTruthy();
  });

  it("prompts for confirmation and removes the experiment when the delete button is confirmed", async () => {
    const recentExperimentsStore = useRecentExperimentsStore();
    const experiment = buildExperiment("Experiment A", makeAtlas(), [0, 0, 0]);
    recentExperimentsStore.add(experiment);

    const wrapper = mountList();
    // The `Dialog` Quasar plugin isn't registered by `mountWithQuasar`, so
    // `$q.dialog` doesn't exist to spy on yet; stub it directly instead.
    const onOk = vi.fn();
    const dialogSpy = vi.fn().mockReturnValue({ onOk });
    wrapper.vm.$q.dialog = dialogSpy;

    const item = wrapper.findComponent({ name: "QItem" });
    await item.findComponent({ name: "QBtn" }).trigger("click");

    expect(dialogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Are you sure you wish to delete "Experiment A"?'
      })
    );

    const onOkCallback = onOk.mock.calls[0]?.[0];
    onOkCallback();

    expect(recentExperimentsStore.recents).not.toContain(experiment);
  });
});
