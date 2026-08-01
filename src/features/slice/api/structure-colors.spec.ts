import { describe, expect, it } from "vitest";
import { makeTerminologyRow } from "@/test/fixtures";
import {
  buildStructureColors,
  findStructureByAnnotationValue
} from "./structure-colors.api";

describe("buildStructureColors", () => {
  it("maps each row's annotation value to its packed color", () => {
    const rows = [
      makeTerminologyRow({ annotation_value: 8, color_hex_triplet: "#BFDAE3" }),
      makeTerminologyRow({
        annotation_value: 997,
        color_hex_triplet: "#FFFFFF"
      })
    ];

    const colors = buildStructureColors(rows);

    expect(colors.size).toBe(2);
    expect(colors.has(8)).toBe(true);
    expect(colors.has(997)).toBe(true);
  });

  it("packs a hex triplet into the correct RGBA8 bytes, read back little-endian", () => {
    const rows = [
      makeTerminologyRow({ annotation_value: 1, color_hex_triplet: "#B0F0FF" })
    ];

    const colors = buildStructureColors(rows);
    const packed = colors.get(1)!;

    const bytes = new Uint8ClampedArray(new Uint32Array([packed]).buffer);
    expect(Array.from(bytes)).toEqual([0xb0, 0xf0, 0xff, 0xff]);
  });

  it("skips rows with a non-positive annotation value", () => {
    const rows = [makeTerminologyRow({ annotation_value: 0 })];

    expect(buildStructureColors(rows).size).toBe(0);
  });

  it("skips rows with a non-finite annotation value", () => {
    const rows = [makeTerminologyRow({ annotation_value: Number.NaN })];

    expect(buildStructureColors(rows).size).toBe(0);
  });
});

describe("findStructureByAnnotationValue", () => {
  it("returns the row matching the annotation value", () => {
    const row = makeTerminologyRow({ annotation_value: 8, identifier: 8 });

    const result = findStructureByAnnotationValue([row], 8);

    expect(result).toBe(row);
  });

  it("returns null for an unknown value", () => {
    const rows = [makeTerminologyRow({ annotation_value: 8 })];

    expect(findStructureByAnnotationValue(rows, 999)).toBeNull();
  });

  it("returns null for an empty row list", () => {
    expect(findStructureByAnnotationValue([], 8)).toBeNull();
  });
});
