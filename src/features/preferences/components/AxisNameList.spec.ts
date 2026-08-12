import { describe, expect, it } from "vitest";
import AxisNameList from "./AxisNameList.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import type { AxisOrder } from "@/utils/axis-order";

function mountList(
  order: AxisOrder = [0, 1, 2],
  names: [string, string, string] = ["", "", ""]
) {
  return mountWithQuasar(AxisNameList, {
    props: {
      label: "Position Axes",
      names,
      order,
      defaultNames: ["AP", "DV", "ML"]
    }
  });
}

describe("AxisNameList", () => {
  it("renders one input per axis, labelled by the built-in name, in display order", () => {
    const wrapper = mountList();

    const inputs = wrapper.findAllComponents({ name: "QInput" });
    expect(inputs.map(input => input.props("label"))).toEqual([
      "AP",
      "DV",
      "ML"
    ]);
  });

  it("shows the user name as the input's value when set", () => {
    const wrapper = mountList([0, 1, 2], ["Bregma AP", "", ""]);

    expect(
      wrapper.findAllComponents({ name: "QInput" })[0]!.props("modelValue")
    ).toBe("Bregma AP");
  });

  it("permutes the rendered order to match the axis order", () => {
    const wrapper = mountList([2, 0, 1]);

    const inputs = wrapper.findAllComponents({ name: "QInput" });
    expect(inputs.map(input => input.props("label"))).toEqual([
      "ML",
      "AP",
      "DV"
    ]);
  });

  it("writes a trimmed edit into the names array at the axis index", async () => {
    const order: AxisOrder = [2, 0, 1];
    const names: [string, string, string] = ["", "", ""];
    const wrapper = mountWithQuasar(AxisNameList, {
      props: {
        label: "Position Axes",
        names,
        order,
        defaultNames: ["AP", "DV", "ML"]
      }
    });

    // Display slot 0 shows axis 2 (ML) under a permuted order.
    await wrapper
      .findAllComponents({ name: "QInput" })[0]!
      .vm.$emit("update:modelValue", "  Interaural ML  ");

    expect(names).toEqual(["", "", "Interaural ML"]);
  });

  it("moves a slot within the order when its handle is dragged onto another row", async () => {
    const order: AxisOrder = [0, 1, 2];
    const wrapper = mountWithQuasar(AxisNameList, {
      props: {
        label: "Position Axes",
        names: ["", "", ""],
        order,
        defaultNames: ["AP", "DV", "ML"]
      }
    });

    const items = wrapper.findAllComponents({ name: "QItem" });
    await wrapper.findAll(".value-row__handle")[0]!.trigger("dragstart");
    await items[2]!.trigger("dragover");
    await items[2]!.trigger("drop");

    expect(order).toEqual([1, 2, 0]);
  });
});
