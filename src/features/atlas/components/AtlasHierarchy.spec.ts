import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, shallowRef } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import type { Scene } from "@babylonjs/core";
import { Mesh, TransformNode, VertexData } from "@babylonjs/core";
import AtlasHierarchy from "./AtlasHierarchy.vue";
import { makeTestScene, mountWithQuasar } from "@/test/mount-helper";
import {
  BabylonRuntimeServiceKey,
  type BabylonRuntimeService
} from "@/services/babylon-runtime.service";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { setStructureVisibility } from "@/features/experiment";
import { getDefaultStructureIdentifiers } from "../api/hierarchy.api";
import { getTerminologyRows } from "../api/source.api";
import {
  makeProbe,
  makeTerminologyRow,
  makeTerminologyRows
} from "@/test/fixtures";

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

async function mountHierarchy(scene: Scene | null = makeTestScene()) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const runtime = {
    scene: shallowRef(scene)
  } as unknown as BabylonRuntimeService;
  const wrapper = mountWithQuasar(AtlasHierarchy, {
    pinia,
    global: {
      provide: { [BabylonRuntimeServiceKey as symbol]: runtime },
      stubs: { QVirtualScroll: QVirtualScrollStub }
    }
  });
  // terminologyRows depends on manifest resolving first, so flush an extra
  // microtask round for that hop to settle.
  await flushPromises();
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

/**
 * Find the rendered row for a hierarchy identifier, using its position in
 * the flattened, DFS-ordered item list the stubbed virtual scroll receives.
 * @param wrapper Mounted `AtlasHierarchy` wrapper.
 * @param identifier Hierarchy item identifier to find the row for.
 */
function findRow(wrapper: VueWrapper, identifier: number) {
  const items = wrapper
    .findComponent({ name: "QVirtualScrollStub" })
    .props("items") as { identifier: number }[];
  const index = items.findIndex(item => item.identifier === identifier);
  return wrapper.findAll(".hierarchy-row")[index]!;
}

/**
 * Put a structure mesh with known (ML, DV, AP) mm vertices under the scene's atlas root,
 * so region centers resolve without any network or Draco decode.
 */
function seedStructureMesh(scene: Scene, identifier: number): void {
  const atlasRoot =
    scene.getTransformNodeByName("atlasRoot_node") ??
    new TransformNode("atlasRoot_node", scene);
  const mesh = new Mesh(`${identifier}_structure_mesh`, scene);
  mesh.parent = atlasRoot;
  const vertexData = new VertexData();
  vertexData.positions = [7, 2, 4, 9, 4, 6, 3, 2, 4, 1, 4, 6];
  vertexData.applyToMesh(mesh);
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
    expect(checkbox.props("toggleIndeterminate")).toBe(false);

    await checkbox.vm.$emit("update:modelValue", true);
    expect(store.experiment.visibleStructures).toContainEqual({
      id: 8,
      isTransparent: false
    });
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
    expect(store.visibleStructures).toEqual(
      getDefaultStructureIdentifiers(store.atlas.name, []).map(id => ({
        id,
        isTransparent: true
      }))
    );
  });

  it("gives a default structure a tri-state checkbox reflecting its transparent seed", async () => {
    vi.mocked(getTerminologyRows).mockResolvedValue([
      makeTerminologyRow({ identifier: 997, parent_identifier: null }),
      makeTerminologyRow({
        identifier: 184,
        parent_identifier: 997,
        annotation_value: 184,
        name: "olfactory areas",
        abbreviation: "OLF"
      })
    ]);
    const wrapper = await mountHierarchy();
    const store = useCurrentExperimentStore();

    const checkbox = wrapper.findComponent({ name: "QCheckbox" });
    expect(checkbox.props("toggleIndeterminate")).toBe(true);
    expect(checkbox.props("modelValue")).toBeNull();

    await checkbox.vm.$emit("update:modelValue", true);
    expect(store.experiment.visibleStructures).toContainEqual({
      id: 184,
      isTransparent: false
    });
    expect(
      store.experiment.visibleStructures.filter(({ id }) => id === 184)
    ).toHaveLength(1);

    await checkbox.vm.$emit("update:modelValue", false);
    expect(store.experiment.visibleStructures).not.toContainEqual(
      expect.objectContaining({ id: 184 })
    );

    await checkbox.vm.$emit("update:modelValue", null);
    expect(store.experiment.visibleStructures).toContainEqual({
      id: 184,
      isTransparent: true
    });
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

    const wrapper = await mountHierarchy();

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

  it("filters to enabled regions in hierarchy order when Enabled only is toggled on", async () => {
    const wrapper = await mountHierarchy();
    const store = useCurrentExperimentStore();
    setStructureVisibility(store.experiment, 700, true);
    setStructureVisibility(store.experiment, 8, true);

    await wrapper.findComponent({ name: "QToggle" }).setValue(true);

    const stub = wrapper.findComponent({ name: "QVirtualScrollStub" });
    expect(
      (stub.props("items") as { identifier: number }[]).map(i => i.identifier)
    ).toEqual([8, 700]);
    expect(wrapper.findAll(".guide")).toHaveLength(0);
    expect(stub.attributes("style")).toContain(
      "--hierarchy-content-width: 56px"
    );

    await wrapper.findComponent({ name: "QInput" }).setValue("grey");
    await wrapper.vm.$nextTick();

    const filteredIdentifiers = (
      wrapper.findComponent({ name: "QVirtualScrollStub" }).props("items") as {
        identifier: number;
      }[]
    ).map(i => i.identifier);
    expect(filteredIdentifiers).toEqual([8]);
  });

  it("shows nothing enabled on a pristine experiment", async () => {
    const wrapper = await mountHierarchy();

    await wrapper.findComponent({ name: "QToggle" }).setValue(true);

    expect(
      wrapper.findComponent({ name: "QVirtualScrollStub" }).props("items")
    ).toEqual([]);
  });

  it("treats an indeterminate default structure as not enabled", async () => {
    vi.mocked(getTerminologyRows).mockResolvedValue([
      makeTerminologyRow({ identifier: 997, parent_identifier: null }),
      makeTerminologyRow({
        identifier: 184,
        parent_identifier: 997,
        annotation_value: 184,
        name: "olfactory areas",
        abbreviation: "OLF"
      })
    ]);
    const wrapper = await mountHierarchy();

    await wrapper.findComponent({ name: "QToggle" }).setValue(true);

    expect(
      wrapper.findComponent({ name: "QVirtualScrollStub" }).props("items")
    ).toEqual([]);
  });

  it("moves the selected camera's target between hemisphere centers on repeat clicks", async () => {
    const scene = makeTestScene();
    seedStructureMesh(scene, 8);
    const wrapper = await mountHierarchy(scene);
    const store = useCurrentExperimentStore();
    store.experiment.referenceCoordinate = [0, 0, 0];
    store.selectedInspectable = store.cameraPose;
    const { alpha, beta, radius } = store.cameraPose;

    await findRow(wrapper, 8).trigger("click");
    await flushPromises();
    expect(store.cameraPose.target).toEqual([5, 3, 8]);

    await findRow(wrapper, 8).trigger("click");
    await flushPromises();
    expect(store.cameraPose.target).toEqual([5, 3, 2]);

    await findRow(wrapper, 8).trigger("click");
    await flushPromises();
    expect(store.cameraPose.target).toEqual([5, 3, 8]);

    expect(store.cameraPose.alpha).toBe(alpha);
    expect(store.cameraPose.beta).toBe(beta);
    expect(store.cameraPose.radius).toBe(radius);
  });

  it("restarts at the right hemisphere when the clicked region changes", async () => {
    const scene = makeTestScene();
    seedStructureMesh(scene, 8);
    seedStructureMesh(scene, 567);
    const wrapper = await mountHierarchy(scene);
    const store = useCurrentExperimentStore();
    store.experiment.referenceCoordinate = [0, 0, 0];
    store.selectedInspectable = store.cameraPose;

    await findRow(wrapper, 8).trigger("click");
    await flushPromises();
    expect(store.cameraPose.target).toEqual([5, 3, 8]);

    await findRow(wrapper, 567).trigger("click");
    await flushPromises();
    expect(store.cameraPose.target).toEqual([5, 3, 8]);

    await findRow(wrapper, 8).trigger("click");
    await flushPromises();
    expect(store.cameraPose.target).toEqual([5, 3, 8]);
  });

  it("moves a selected, unlocked probe's tip to the region center", async () => {
    const scene = makeTestScene();
    seedStructureMesh(scene, 8);
    const wrapper = await mountHierarchy(scene);
    const store = useCurrentExperimentStore();
    store.experiment.referenceCoordinate = [0, 0, 0];
    const probe = makeProbe({ tipPosition: [0, 0, 0] });
    store.experiment.probes.push(probe);
    store.selectedInspectable = probe;

    await findRow(wrapper, 8).trigger("click");
    await flushPromises();

    expect(probe.tipPosition).toEqual([5, 3, 8]);
  });

  it("leaves a locked probe's tip untouched and its row not clickable", async () => {
    const scene = makeTestScene();
    seedStructureMesh(scene, 8);
    const wrapper = await mountHierarchy(scene);
    const store = useCurrentExperimentStore();
    store.experiment.referenceCoordinate = [0, 0, 0];
    const probe = makeProbe({ tipPosition: [0, 0, 0], lock: true });
    store.experiment.probes.push(probe);
    store.selectedInspectable = probe;
    await wrapper.vm.$nextTick();

    expect(findRow(wrapper, 8).classes()).not.toContain(
      "hierarchy-row--clickable"
    );

    await findRow(wrapper, 8).trigger("click");
    await flushPromises();

    expect(probe.tipPosition).toEqual([0, 0, 0]);
  });

  it("gives no row the clickable class when nothing is selected", async () => {
    const wrapper = await mountHierarchy();

    expect(findRow(wrapper, 8).classes()).not.toContain(
      "hierarchy-row--clickable"
    );
  });

  it("does not move the selection when the row's checkbox is clicked", async () => {
    const wrapper = await mountHierarchy();
    const store = useCurrentExperimentStore();
    store.experiment.referenceCoordinate = [0, 0, 0];
    store.selectedInspectable = store.cameraPose;
    store.cameraPose.target = [0, 0, 0];

    await wrapper.findComponent({ name: "QCheckbox" }).trigger("click");

    expect(store.experiment.visibleStructures).toContainEqual({
      id: 8,
      isTransparent: false
    });
    expect(store.cameraPose.target).toEqual([0, 0, 0]);
  });

  it("clears the region-center loading flag after a move, and drops a click made while one is in flight", async () => {
    const scene = makeTestScene();
    seedStructureMesh(scene, 8);
    const wrapper = await mountHierarchy(scene);
    const store = useCurrentExperimentStore();
    store.experiment.referenceCoordinate = [0, 0, 0];
    store.selectedInspectable = store.cameraPose;

    await findRow(wrapper, 8).trigger("click");
    await flushPromises();
    expect(store.isLoadingRegionCenter).toBe(false);
    expect(store.cameraPose.target).toEqual([5, 3, 8]);

    store.isLoadingRegionCenter = true;
    await findRow(wrapper, 8).trigger("click");
    await flushPromises();

    expect(store.cameraPose.target).toEqual([5, 3, 8]);
  });
});
