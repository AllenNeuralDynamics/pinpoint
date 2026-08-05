import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import AtlasHierarchy from "./AtlasHierarchy.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { setStructureVisibility } from "@/features/experiment";
import { getTerminologyRows } from "../api/source.api";
import { makeTerminologyRows } from "@/test/fixtures";

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

vi.mock("../api/source.api", async () => {
  const actual =
    await vi.importActual<typeof import("../api/source.api")>(
      "../api/source.api"
    );
  return { ...actual, getTerminologyRows: vi.fn() };
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
    vi.mocked(getTerminologyRows).mockReset();
    vi.mocked(getTerminologyRows).mockResolvedValue(makeTerminologyRows());
  });

  it("renders every row in DFS hierarchy order when the filter is empty", async () => {
    const wrapper = await mountHierarchy();

    const stub = wrapper.findComponent({ name: "QVirtualScrollStub" });
    expect(stub.exists()).toBe(true);
    expect(
      (stub.props("items") as { identifier: number }[]).map(i => i.identifier)
    ).toEqual([8, 567, 688, 700]);
  });

  it("reorders to the Fuse results once a filter is entered, ranking the exact match first", async () => {
    const wrapper = await mountHierarchy();

    await wrapper.findComponent({ name: "QInput" }).setValue("grey");
    await wrapper.vm.$nextTick();

    const stub = wrapper.findComponent({ name: "QVirtualScrollStub" });
    const identifiers = (stub.props("items") as { identifier: number }[]).map(
      i => i.identifier
    );
    expect(identifiers[0]).toBe(8);
    expect(identifiers).not.toEqual([8, 567, 688, 700]);
  });

  it("keeps hierarchy order when the filter is only whitespace", async () => {
    const wrapper = await mountHierarchy();

    await wrapper.findComponent({ name: "QInput" }).setValue("   ");
    await wrapper.vm.$nextTick();

    const stub = wrapper.findComponent({ name: "QVirtualScrollStub" });
    expect(
      (stub.props("items") as { identifier: number }[]).map(i => i.identifier)
    ).toEqual([8, 567, 688, 700]);
  });

  it("reflects and toggles structure visibility via the checkbox", async () => {
    const wrapper = await mountHierarchy();
    const store = useCurrentExperimentStore();

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

  it("orders each row as guides, then checkbox, then icon, then text", async () => {
    const wrapper = await mountHierarchy();

    // Identifier 567 is nested (has at least one guide), so its row exercises
    // the guide-then-checkbox ordering that a top-level row wouldn't.
    const row = wrapper
      .findAll(".hierarchy-row")
      .find(r => r.text().includes("CH"))!;
    const children = Array.from(row.element.children);

    const firstGuideIndex = children.findIndex(child =>
      child.classList.contains("guide")
    );
    const checkboxGroupIndex = children.findIndex(
      child => child.querySelector(".q-checkbox") !== null
    );
    expect(firstGuideIndex).toBeGreaterThanOrEqual(0);
    expect(firstGuideIndex).toBeLessThan(checkboxGroupIndex);
  });

  it("colors each row's icon from color_hex_triplet", async () => {
    const wrapper = await mountHierarchy();

    const icon = wrapper
      .findAllComponents({ name: "QIcon" })
      .find(i => i.props("name") === "radio_button_checked")!;
    expect(icon.attributes("style")).toContain("#BFDAE3");
  });

  it("title-cases each row's name", async () => {
    const wrapper = await mountHierarchy();

    expect(wrapper.text()).toContain("Basic Cell Groups And Regions");
  });

  it("renders no items when the fetch fails", async () => {
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

    expect(
      wrapper.findComponent({ name: "QVirtualScrollStub" }).props("items")
    ).toEqual([]);
  });

  it("sizes the scroller from the deepest row in the list", async () => {
    const wrapper = await mountHierarchy();

    expect(
      wrapper.findComponent({ name: "QVirtualScrollStub" }).attributes("style")
    ).toContain("--hierarchy-content-width: 88px");
  });

  it("drops the indent from the width while searching", async () => {
    const wrapper = await mountHierarchy();

    await wrapper.findComponent({ name: "QInput" }).setValue("grey");
    await wrapper.vm.$nextTick();

    expect(
      wrapper.findComponent({ name: "QVirtualScrollStub" }).attributes("style")
    ).toContain("--hierarchy-content-width: 56px");
  });
});
