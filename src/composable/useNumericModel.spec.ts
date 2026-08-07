import { describe, expect, it, vi } from "vitest";
import { useNumericModel } from "./useNumericModel";

describe("useNumericModel", () => {
  it("reads the stored value as a string", () => {
    let stored = 2;
    const model = useNumericModel(
      () => stored,
      value => (stored = value),
      value => value,
      value => value,
      () => null
    );

    expect(model.value).toBe("2");
  });

  it("writes a parsed number back through the setter", () => {
    let stored = 1;
    const model = useNumericModel(
      () => stored,
      value => (stored = value),
      value => value,
      value => value,
      () => null
    );

    model.value = "5";

    expect(stored).toBe(5);
  });

  it("converts the stored value into display units on read", () => {
    const stored = 1;
    const model = useNumericModel(
      () => stored,
      vi.fn(),
      millimeters => millimeters / 0.001,
      micrometers => micrometers * 0.001,
      () => 3
    );

    expect(model.value).toBe("1000.000");
  });

  it("rounds the displayed value to the given decimal places", () => {
    const stored = 1.23456;
    const model = useNumericModel(
      () => stored,
      vi.fn(),
      value => value,
      value => value,
      () => 3
    );

    expect(model.value).toBe("1.235");
  });

  it("does not call set when committing an unedited rounded read", () => {
    const set = vi.fn();
    const model = useNumericModel(
      () => 1.23456,
      set,
      value => value,
      value => value,
      () => 3
    );

    model.value = "1.235";

    expect(set).not.toHaveBeenCalled();
  });

  it("calls set with the converted value on a real edit", () => {
    const set = vi.fn();
    const model = useNumericModel(
      () => 1.23456,
      set,
      value => value,
      value => value,
      () => 3
    );

    model.value = "2";

    expect(set).toHaveBeenCalledWith(2);
  });
});
