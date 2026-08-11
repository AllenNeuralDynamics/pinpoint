import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import CoordinateSystemInspector from "./CoordinateSystemInspector.vue";
import CoordinateSystemNodeInspector from "./CoordinateSystemNodeInspector.vue";
import CoordinateSystemValueInspector from "./CoordinateSystemValueInspector.vue";
import CoordinateSystemValueList from "./CoordinateSystemValueList.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { makeCoordinateSystem } from "@/test/fixtures";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getTerminologyRows } from "@/features/atlas";
import enUS from "@/i18n/en-US";

// `useCurrentExperimentStore` eagerly resolves the default experiment's
// terminology rows on creation, which would otherwise fire a real network
// request. Mirrors the mocking approach in Inspector.spec.ts.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

const t = enUS.coordinateSystemInspector;
const axis = enUS.axis;

function fieldByLabel(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents({ name: "QInput" })
    .find(field => field.props("label") === label)!;
}

/** The toggle rendering a given label. */
function findToggle(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents({ name: "QToggle" })
    .find(toggle => toggle.props("label") === label)!;
}

/**
 * Focus, replace a field's text, and blur it -- the sequence a real user
 * produces, which `use-field`'s handlers require in this order.
 */
async function editAndBlur(field: VueWrapper, value: string) {
  const native = field.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("focusout");
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve);
  await promise;
}

function mountInspector(coordinateSystem = makeCoordinateSystem()) {
  const wrapper = mountWithQuasar(CoordinateSystemInspector, {
    props: { coordinateSystem }
  });
  return { wrapper, coordinateSystem };
}

describe("CoordinateSystemInspector", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("trims whitespace when committing a name", async () => {
    const { wrapper, coordinateSystem } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, t.name), "  Renamed  ");

    expect(coordinateSystem.name).toBe("Renamed");
  });

  it("rejects a whitespace-only name and leaves it unchanged", async () => {
    const { wrapper, coordinateSystem } = mountInspector(
      makeCoordinateSystem({ name: "A" })
    );

    await editAndBlur(fieldByLabel(wrapper, t.name), "   ");

    expect(coordinateSystem.name).toBe("A");
  });

  it("clicking Add Transform appends exactly one node to the chain", async () => {
    const { wrapper, coordinateSystem } = mountInspector();
    expect(coordinateSystem.chain).toHaveLength(1);

    const addButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text().includes(t.addTransform))!;
    await addButton.trigger("click");

    expect(coordinateSystem.chain).toHaveLength(2);
    expect(
      coordinateSystem.chain[1]!.position.map(value => value.name)
    ).toEqual(["ML", "DV", "AP"]);
  });

  it("renders each node's name as its expansion item label", () => {
    const { wrapper, coordinateSystem } = mountInspector(
      makeCoordinateSystem({
        chain: [
          ...makeCoordinateSystem().chain,
          ...makeCoordinateSystem().chain
        ]
      })
    );

    const labels = wrapper
      .findAllComponents({ name: "QExpansionItem" })
      .map(item => item.find(".q-item__label").text());
    expect(labels).toEqual(coordinateSystem.chain.map(node => node.name));
  });

  it("editing the transform name field renames the node and trims", async () => {
    const { wrapper, coordinateSystem } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, t.nodeName), "  Depth  ");

    expect(coordinateSystem.chain[0]!.name).toBe("Depth");
  });

  it("names a newly added transform by its position in the chain", async () => {
    const { wrapper, coordinateSystem } = mountInspector();

    const addButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text().includes(t.addTransform))!;
    await addButton.trigger("click");

    expect(coordinateSystem.chain[1]!.name).toBe(
      t.newTransformName.replace("{index}", "2")
    );
  });

  it("renders one CoordinateSystemNodeInspector per chain node", () => {
    const { wrapper } = mountInspector(
      makeCoordinateSystem({
        chain: [
          ...makeCoordinateSystem().chain,
          ...makeCoordinateSystem().chain
        ]
      })
    );

    expect(
      wrapper.findAllComponents(CoordinateSystemNodeInspector)
    ).toHaveLength(2);
  });

  it("toggling the offset toggle updates the coordinate system", async () => {
    const { wrapper, coordinateSystem } = mountInspector();

    await findToggle(wrapper, t.offsetByReferenceCoordinate).setValue(true);

    expect(coordinateSystem.offsetByReferenceCoordinate).toBe(true);
  });

  it("toggling the surface toggle updates the first node", async () => {
    const { wrapper, coordinateSystem } = mountInspector();

    await findToggle(wrapper, t.surfaceCoordinate).setValue(true);

    expect(coordinateSystem.chain[0]!.onSurface).toBe(true);
  });

  it("enabling a second node's surface toggle clears the first node's", async () => {
    const { wrapper, coordinateSystem } = mountInspector(
      makeCoordinateSystem({
        chain: [
          { ...makeCoordinateSystem().chain[0]!, onSurface: true },
          makeCoordinateSystem().chain[0]!
        ]
      })
    );

    const secondNode = wrapper.findAllComponents(
      CoordinateSystemNodeInspector
    )[1]!;
    const secondToggle = secondNode
      .findAllComponents({ name: "QToggle" })
      .find(toggle => toggle.props("label") === t.surfaceCoordinate)!;
    await secondToggle.setValue(true);

    expect(coordinateSystem.chain.map(node => node.onSurface)).toEqual([
      false,
      true
    ]);
  });

  it("editing the first value-name field renames the value", async () => {
    const { wrapper, coordinateSystem } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, t.valueName), "  Depth  ");

    expect(coordinateSystem.chain[0]!.position[0]!.name).toBe("Depth");
  });

  it("clicking a value's X axis button swaps the display order", async () => {
    const { wrapper, coordinateSystem } = mountInspector();

    const secondPositionValue = wrapper.findAllComponents(
      CoordinateSystemValueInspector
    )[1]!;
    const xButton = secondPositionValue
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === axis.x)!;
    await xButton.trigger("click");

    expect(coordinateSystem.chain[0]!.positionDisplayOrder).toEqual([1, 0, 2]);
  });

  it("clicking the User constraint button marks the value user-constrained", async () => {
    const { wrapper, coordinateSystem } = mountInspector();

    const firstValue = wrapper.findAllComponents(
      CoordinateSystemValueInspector
    )[0]!;
    await firstValue
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === t.modeUser)!
      .trigger("click");

    expect(coordinateSystem.chain[0]!.position[0]!.mode).toBe("user");
  });

  it("clicking the Free constraint button returns a fixed value to free", async () => {
    const coordinateSystem = makeCoordinateSystem();
    coordinateSystem.chain[0]!.position[0]!.mode = "fixed";
    const { wrapper } = mountInspector(coordinateSystem);

    const firstValue = wrapper.findAllComponents(
      CoordinateSystemValueInspector
    )[0]!;
    await firstValue
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === t.modeFree)!
      .trigger("click");

    expect(coordinateSystem.chain[0]!.position[0]!.mode).toBe("free");
  });

  it("drag-reorders position values, keeping axis mapping stable", async () => {
    const { wrapper, coordinateSystem } = mountInspector();

    const positionList = wrapper.findAllComponents(
      CoordinateSystemValueList
    )[0]!;
    const items = positionList.findAllComponents({ name: "QItem" });
    await wrapper.findAll(".value-row__handle")[0]!.trigger("dragstart");
    await items[2]!.trigger("dragover");
    await items[2]!.trigger("drop");

    expect(
      coordinateSystem.chain[0]!.position.map(value => value.name)
    ).toEqual(["DV", "AP", "ML"]);
    expect(coordinateSystem.chain[0]!.positionDisplayOrder).toEqual([2, 0, 1]);
  });

  it("clicking a second node's axis button focuses it, and unmounting resets the focus", async () => {
    const { wrapper } = mountInspector(
      makeCoordinateSystem({
        chain: [
          ...makeCoordinateSystem().chain,
          ...makeCoordinateSystem().chain
        ]
      })
    );
    const currentExperiment = useCurrentExperimentStore();

    const secondNode = wrapper.findAllComponents(
      CoordinateSystemNodeInspector
    )[1]!;
    const xButton = secondNode
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === axis.x)!;
    await xButton.trigger("click");

    expect(currentExperiment.focusedCoordinateSystemNodeIndex).toBe(1);

    wrapper.unmount();

    expect(currentExperiment.focusedCoordinateSystemNodeIndex).toBeNull();
  });

  it("drag-reorders transforms, dropping the focused-node highlight", async () => {
    const { wrapper, coordinateSystem } = mountInspector(
      makeCoordinateSystem({
        chain: [
          { ...makeCoordinateSystem().chain[0]!, name: "First" },
          { ...makeCoordinateSystem().chain[0]!, name: "Second" }
        ]
      })
    );
    useCurrentExperimentStore().focusedCoordinateSystemNodeIndex = 1;

    await wrapper.findAll(".node-row__handle")[1]!.trigger("dragstart");
    const nodes = wrapper.findAllComponents(CoordinateSystemNodeInspector);
    await nodes[0]!.trigger("dragover");
    await nodes[0]!.trigger("drop");

    expect(coordinateSystem.chain.map(node => node.name)).toEqual([
      "Second",
      "First"
    ]);
    expect(
      useCurrentExperimentStore().focusedCoordinateSystemNodeIndex
    ).toBeNull();
  });

  it("clicking a handle does not expand or collapse the item", async () => {
    const { wrapper } = mountInspector();
    const nodeInspector = wrapper.findComponent(CoordinateSystemNodeInspector);
    expect(nodeInspector.classes()).toContain("q-expansion-item--expanded");

    await wrapper.find(".node-row__handle").trigger("click");

    expect(nodeInspector.classes()).toContain("q-expansion-item--expanded");
  });

  it("clicking a second node's Delete Transform button removes only that node and drops the focus", async () => {
    const { wrapper, coordinateSystem } = mountInspector(
      makeCoordinateSystem({
        chain: [
          { ...makeCoordinateSystem().chain[0]!, name: "First" },
          { ...makeCoordinateSystem().chain[0]!, name: "Second" }
        ]
      })
    );
    useCurrentExperimentStore().focusedCoordinateSystemNodeIndex = 1;

    const secondNode = wrapper.findAllComponents(
      CoordinateSystemNodeInspector
    )[1]!;
    const deleteButton = secondNode
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text().includes(t.deleteTransform))!;
    await deleteButton.trigger("click");

    expect(coordinateSystem.chain.map(node => node.name)).toEqual(["First"]);
    expect(
      useCurrentExperimentStore().focusedCoordinateSystemNodeIndex
    ).toBeNull();
  });
});
