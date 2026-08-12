import { describe, expect, it } from "vitest";
import {
  getAxisSlots,
  IDENTITY_AXIS_ORDER,
  isAxisOrder,
  moveAxisSlot,
  type AxisOrder
} from "./axis-order";

describe("IDENTITY_AXIS_ORDER", () => {
  it("is the identity permutation", () => {
    expect(IDENTITY_AXIS_ORDER).toEqual([0, 1, 2]);
  });
});

describe("isAxisOrder", () => {
  it("accepts every permutation of [0, 1, 2]", () => {
    expect(isAxisOrder([0, 1, 2])).toBe(true);
    expect(isAxisOrder([2, 1, 0])).toBe(true);
    expect(isAxisOrder([1, 2, 0])).toBe(true);
  });

  it("rejects a repeated index", () => {
    expect(isAxisOrder([0, 0, 1])).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isAxisOrder([0, 1])).toBe(false);
    expect(isAxisOrder([0, 1, 2, 0])).toBe(false);
  });

  it("rejects non-array values", () => {
    expect(isAxisOrder("012")).toBe(false);
    expect(isAxisOrder(null)).toBe(false);
  });
});

describe("moveAxisSlot", () => {
  it("moves a slot from one position to another", () => {
    const order: AxisOrder = [0, 1, 2];

    moveAxisSlot(order, 0, 2);

    expect(order).toEqual([1, 2, 0]);
  });

  it("is a no-op when fromSlot equals toSlot", () => {
    const order: AxisOrder = [0, 1, 2];

    moveAxisSlot(order, 1, 1);

    expect(order).toEqual([0, 1, 2]);
  });

  it("is a no-op for an out-of-range slot", () => {
    const order: AxisOrder = [0, 1, 2];

    moveAxisSlot(order, -1, 1);
    moveAxisSlot(order, 0, 3);

    expect(order).toEqual([0, 1, 2]);
  });
});

describe("getAxisSlots", () => {
  const defaultNames: [string, string, string] = ["AP", "DV", "ML"];

  it("returns slots in display order, using the built-in name when unnamed", () => {
    const slots = getAxisSlots([0, 1, 2], ["", "", ""], defaultNames);

    expect(slots).toEqual([
      { axis: 0, label: "AP" },
      { axis: 1, label: "DV" },
      { axis: 2, label: "ML" }
    ]);
  });

  it("permutes the axis order into the display order", () => {
    const slots = getAxisSlots([2, 0, 1], ["", "", ""], defaultNames);

    expect(slots.map(slot => slot.axis)).toEqual([2, 0, 1]);
    expect(slots.map(slot => slot.label)).toEqual(["ML", "AP", "DV"]);
  });

  it("prefers a user name over the built-in label", () => {
    const slots = getAxisSlots([0, 1, 2], ["Bregma AP", "", ""], defaultNames);

    expect(slots[0]).toEqual({ axis: 0, label: "Bregma AP" });
  });
});
