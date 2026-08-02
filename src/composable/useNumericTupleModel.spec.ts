import { describe, expect, it } from "vitest";
import { useNumericTupleModel } from "./useNumericTupleModel";

describe("useNumericTupleModel", () => {
  it("reads the tuple element as a string", () => {
    const tuple: [number, number, number] = [1, 2, 3];
    const model = useNumericTupleModel(() => tuple, 1);

    expect(model.value).toBe("2");
  });

  it("writes a parsed number back to the tuple", () => {
    const tuple: [number, number, number] = [1, 2, 3];
    const model = useNumericTupleModel(() => tuple, 0);

    model.value = "5";

    expect(tuple[0]).toBe(5);
  });

  it("picks up a different tuple once the getter returns one", () => {
    let tuple: [number, number, number] = [1, 2, 3];
    const model = useNumericTupleModel(() => tuple, 0);

    tuple = [4, 5, 6];

    expect(model.value).toBe("4");
  });
});
