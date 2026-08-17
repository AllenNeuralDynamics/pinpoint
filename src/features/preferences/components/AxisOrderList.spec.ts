import { describe, expect, it } from "vitest";
import AxisOrderList from "./AxisOrderList.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import type { AxisOrder } from "@/utils/axis-order";

/**
 * Mount an order list over the three rotation labels.
 * @param order Display order the rows are shown in.
 */
function mountList(order: AxisOrder = [0, 1, 2]) {
  return mountWithQuasar(AxisOrderList, {
    props: {
      label: "Rotation Input Order",
      labels: ["Pitch", "Roll", "Yaw"],
      order
    }
  });
}

describe("AxisOrderList", () => {
  it("lists the axis labels in display order", () => {
    const wrapper = mountList([2, 0, 1]);

    expect(
      wrapper
        .findAllComponents({ name: "QItemSection" })
        .filter(section => !section.props("side"))
        .map(section => section.text())
    ).toEqual(["Yaw", "Pitch", "Roll"]);
  });

  it("emits a move when a row's handle is dragged onto another row", async () => {
    const wrapper = mountList();

    const rows = wrapper.findAllComponents({ name: "QItem" });
    await wrapper.findAll(".order-row__handle")[0]!.trigger("dragstart");
    await rows[2]!.trigger("dragover");
    await rows[2]!.trigger("drop");

    expect(wrapper.emitted("move")).toEqual([[0, 2]]);
  });
});
