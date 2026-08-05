import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useClampedNumberModel } from "./useClampedNumberModel";

describe("useClampedNumberModel", () => {
  it("reads the source ref's value", () => {
    const source = ref(5);
    const model = useClampedNumberModel(source, 0, 10);

    expect(model.value).toBe(5);
  });

  it("writes a valid numeric string", () => {
    const source = ref(5);
    const model = useClampedNumberModel(source, 0, 10);

    model.value = "7";

    expect(source.value).toBe(7);
  });

  it("clamps a write above the maximum", () => {
    const source = ref(5);
    const model = useClampedNumberModel(source, 0, 10);

    model.value = "42";

    expect(source.value).toBe(10);
  });

  it("clamps a write below the minimum", () => {
    const source = ref(5);
    const model = useClampedNumberModel(source, 0, 10);

    model.value = "-42";

    expect(source.value).toBe(0);
  });

  it("ignores an empty string, leaving the source untouched", () => {
    const source = ref(5);
    const model = useClampedNumberModel(source, 0, 10);

    model.value = "";

    expect(source.value).toBe(5);
  });

  it("ignores a null value, leaving the source untouched", () => {
    const source = ref(5);
    const model = useClampedNumberModel(source, 0, 10);

    model.value = null;

    expect(source.value).toBe(5);
  });

  it("ignores a non-numeric string, leaving the source untouched", () => {
    const source = ref(5);
    const model = useClampedNumberModel(source, 0, 10);

    model.value = "abc";

    expect(source.value).toBe(5);
  });

  it("ignores NaN, leaving the source untouched", () => {
    const source = ref(5);
    const model = useClampedNumberModel(source, 0, 10);

    model.value = NaN;

    expect(source.value).toBe(5);
  });

  it("ignores Infinity, leaving the source untouched", () => {
    const source = ref(5);
    const model = useClampedNumberModel(source, 0, 10);

    model.value = Infinity;

    expect(source.value).toBe(5);
  });
});
