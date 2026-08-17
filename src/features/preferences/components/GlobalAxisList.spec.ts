import { describe, expect, it } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import GlobalAxisList from "./GlobalAxisList.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import type { AxisOrder } from "@/utils/axis-order";
import {
  buildDefaultGlobalCoordinateSystem,
  type GlobalCoordinateSystem
} from "@/utils/coordinate-frame";
import enUS from "@/i18n/en-US";

/**
 * Mount the axis list over a copy of the default RAS axes.
 * @param order Display order the rows are shown in.
 * @param axes Axes to show; defaults to the RAS axes.
 */
function mountList(
  order: AxisOrder = [0, 1, 2],
  axes: GlobalCoordinateSystem["axes"] = buildDefaultGlobalCoordinateSystem()
    .axes
) {
  return mountWithQuasar(GlobalAxisList, { props: { axes, order } });
}

/**
 * Every rendered name input, in DOM order: position then rotation per row.
 * @param wrapper Mounted axis list to read.
 */
function nameInputs(wrapper: VueWrapper) {
  return wrapper.findAllComponents({ name: "QInput" });
}

describe("GlobalAxisList", () => {
  it("shows one row per axis, each pointing where its axis points", () => {
    const wrapper = mountList();

    expect(
      wrapper
        .findAllComponents({ name: "DirectionSelect" })
        .map(select => select.props("modelValue"))
    ).toEqual([
      "Left_to_right",
      "Posterior_to_anterior",
      "Inferior_to_superior"
    ]);
  });

  it("labels each row's name inputs by the built-in labels of its direction", () => {
    const wrapper = mountList();

    expect(nameInputs(wrapper).map(input => input.props("label"))).toEqual([
      enUS.axis.ml,
      enUS.axis.pitch,
      enUS.axis.ap,
      enUS.axis.roll,
      enUS.axis.si,
      enUS.axis.yaw
    ]);
  });

  it("shows the rows in the display order it is given", () => {
    const wrapper = mountList([2, 0, 1]);

    expect(nameInputs(wrapper).map(input => input.props("label"))).toEqual([
      enUS.axis.si,
      enUS.axis.yaw,
      enUS.axis.ml,
      enUS.axis.pitch,
      enUS.axis.ap,
      enUS.axis.roll
    ]);
  });

  it("shows the user names an axis carries", () => {
    const axes = buildDefaultGlobalCoordinateSystem().axes;
    axes[1].positionName = "Bregma AP";
    axes[1].rotationName = "Tilt";
    const wrapper = mountList([0, 1, 2], axes);

    expect(nameInputs(wrapper)[2]!.props("modelValue")).toBe("Bregma AP");
    expect(nameInputs(wrapper)[3]!.props("modelValue")).toBe("Tilt");
  });

  it("emits the picked direction against the row's own axis", async () => {
    const wrapper = mountList([2, 0, 1]);

    await wrapper
      .findAllComponents({ name: "DirectionSelect" })[0]!
      .vm.$emit("update:modelValue", "Right_to_left");

    expect(wrapper.emitted("pickDirection")).toEqual([[2, "Right_to_left"]]);
  });

  it("emits trimmed position and rotation names against the row's own axis", async () => {
    const wrapper = mountList([2, 0, 1]);

    await nameInputs(wrapper)[0]!.vm.$emit("update:modelValue", "  Depth SI  ");
    await nameInputs(wrapper)[1]!.vm.$emit("update:modelValue", "  Spin  ");

    expect(wrapper.emitted("renamePosition")).toEqual([[2, "Depth SI"]]);
    expect(wrapper.emitted("renameRotation")).toEqual([[2, "Spin"]]);
  });

  it("emits a move when a row's handle is dragged onto another row", async () => {
    const wrapper = mountList();

    const rows = wrapper.findAllComponents({ name: "QItem" });
    await wrapper.findAll(".axis-row__handle")[0]!.trigger("dragstart");
    await rows[2]!.trigger("dragover");
    await rows[2]!.trigger("drop");

    expect(wrapper.emitted("move")).toEqual([[0, 2]]);
  });
});
