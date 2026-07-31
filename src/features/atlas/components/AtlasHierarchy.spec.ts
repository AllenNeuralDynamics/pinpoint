import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import AtlasHierarchy from "./AtlasHierarchy.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { setStructureVisibility } from "@/features/experiment";
import { getManifest, getTerminologyRows } from "../api/source.api";
import { makeManifest, makeTerminologyRows } from "@/test/fixtures";

/**
 * `QVirtualScroll` only renders the rows that fit its measured scroll
 * height, which is always 0 in happy-dom - so its default slot never runs
 * in tests. Stub it with something that renders every item's slot content
 * unconditionally, which is enough to assert on the contract (visibility
 * checkbox wiring) without needing real virtualization/scroll layout.
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

// `useCurrentExperimentStore`'s `manifest` is also a `computedAsync` that
// fetches from this module whenever the store is created, so `getManifest`
// must be mocked too or mounting this component triggers a real request.
vi.mock("../api/source.api", async () => {
  const actual =
    await vi.importActual<typeof import("../api/source.api")>(
      "../api/source.api"
    );
  return { ...actual, getManifest: vi.fn(), getTerminologyRows: vi.fn() };
});

async function mountHierarchy() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mountWithQuasar(AtlasHierarchy, {
    pinia,
    global: { stubs: { QVirtualScroll: QVirtualScrollStub } }
  });
  // terminologyRows depends on manifest resolving first, so flush an extra
  // microtask round for that hop to settle.
  await flushPromises();
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe("AtlasHierarchy", () => {
  beforeEach(() => {
    vi.mocked(getManifest).mockReset();
    vi.mocked(getManifest).mockResolvedValue(makeManifest());
    vi.mocked(getTerminologyRows).mockReset();
    vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());
  });

  it("renders the q-tree (not the virtual scroll) when the filter is empty", async () => {
    const wrapper = await mountHierarchy();

    expect(wrapper.findComponent({ name: "QTree" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "QVirtualScrollStub" }).exists()).toBe(
      false
    );
  });

  it("switches to the virtual-scroll result list once a filter is entered", async () => {
    const wrapper = await mountHierarchy();

    await wrapper.findComponent({ name: "QInput" }).setValue("grey");
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "QVirtualScrollStub" }).exists()).toBe(
      true
    );
    expect(wrapper.findComponent({ name: "QTree" }).exists()).toBe(false);
  });

  it("stays in tree mode when the filter is only whitespace", async () => {
    const wrapper = await mountHierarchy();

    await wrapper.findComponent({ name: "QInput" }).setValue("   ");
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "QTree" }).exists()).toBe(true);
  });

  it("reflects and toggles structure visibility via the checkbox in search results", async () => {
    const wrapper = await mountHierarchy();
    const store = useCurrentExperimentStore();

    await wrapper.findComponent({ name: "QInput" }).setValue("grey");
    await wrapper.vm.$nextTick();

    const checkbox = wrapper.findComponent({ name: "QCheckbox" });
    expect(checkbox.props("modelValue")).toBe(false);

    await checkbox.vm.$emit("update:modelValue", true);
    expect(store.experiment.visibleStructures).toContain(8);
  });

  it("shows the Clear button only when structures are visible, and clears on click", async () => {
    const wrapper = await mountHierarchy();
    const store = useCurrentExperimentStore();

    expect(
      wrapper
        .findAllComponents({ name: "QBtn" })
        .some(b => b.props("icon") === "clear_all")
    ).toBe(false);

    setStructureVisibility(store.experiment, 8, true);
    await wrapper.vm.$nextTick();

    const clearBtn = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(b => b.props("icon") === "clear_all")!;
    expect(clearBtn).toBeDefined();

    await clearBtn.trigger("click");
    expect(store.visibleStructures).toEqual([]);
  });

  it("colors the search-result icon from color_hex_triplet, matching tree mode", async () => {
    const wrapper = await mountHierarchy();

    await wrapper.findComponent({ name: "QInput" }).setValue("grey");
    await wrapper.vm.$nextTick();

    const icon = wrapper
      .findAllComponents({ name: "QIcon" })
      .find(i => i.props("name") === "radio_button_checked")!;
    expect(icon.attributes("style")).toContain("#BFDAE3");
  });

  it("title-cases the search-result name, same as tree mode", async () => {
    const wrapper = await mountHierarchy();

    await wrapper.findComponent({ name: "QInput" }).setValue("grey");
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Basic Cell Groups And Regions");
  });

  it("leaves the tree empty when the fetch fails", async () => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mountWithQuasar(AtlasHierarchy, {
      pinia,
      global: { stubs: { QVirtualScroll: QVirtualScrollStub } }
    });

    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "QTree" }).props("nodes")).toEqual([]);
  });
});
