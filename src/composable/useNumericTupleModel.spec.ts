import { describe, expect, it } from "vitest";
import { useNumericTupleModel } from "./useNumericTupleModel";

describe("useNumericTupleModel", () => {
  it("reads the tuple element as a string", () => {
    const tuple: [number, number, number] = [1, 2, 3];
    const model = useNumericTupleModel(
      () => tuple,
      1,
      value => value,
      value => value,
      () => null
    );

    expect(model.value).toBe("2");
  });

  it("writes a parsed number back to the tuple", () => {
    const tuple: [number, number, number] = [1, 2, 3];
    const model = useNumericTupleModel(
      () => tuple,
      0,
      value => value,
      value => value,
      () => null
    );

    model.value = "5";

    expect(tuple[0]).toBe(5);
  });

  it("picks up a different tuple once the getter returns one", () => {
    let tuple: [number, number, number] = [1, 2, 3];
    const model = useNumericTupleModel(
      () => tuple,
      0,
      value => value,
      value => value,
      () => null
    );

    tuple = [4, 5, 6];

    expect(model.value).toBe("4");
  });

  it("converts the stored value into display units on read", () => {
    const tuple: [number, number, number] = [1, 0, 0];
    const model = useNumericTupleModel(
      () => tuple,
      0,
      millimeters => millimeters / 0.001,
      micrometers => micrometers * 0.001,
      () => 3
    );

    expect(model.value).toBe("1000.000");
  });

  it("rounds the displayed value to the given decimal places", () => {
    const tuple: [number, number, number] = [1.23456, 0, 0];
    const model = useNumericTupleModel(
      () => tuple,
      0,
      value => value,
      value => value,
      () => 3
    );

    expect(model.value).toBe("1.235");
  });

  it("does not truncate the stored value when committing an unedited rounded read", () => {
    const tuple: [number, number, number] = [1.23456, 0, 0];
    const model = useNumericTupleModel(
      () => tuple,
      0,
      value => value,
      value => value,
      () => 3
    );

    model.value = "1.235";

    expect(tuple[0]).toBe(1.23456);
  });

  it("commits a real edit even when it changes only the rounded digits", () => {
    const tuple: [number, number, number] = [1.23456, 0, 0];
    const model = useNumericTupleModel(
      () => tuple,
      0,
      value => value,
      value => value,
      () => 3
    );

    model.value = "2";

    expect(tuple[0]).toBe(2);
  });
});
