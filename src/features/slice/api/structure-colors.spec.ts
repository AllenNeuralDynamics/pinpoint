import { describe, expect, it } from "vitest";
import { makeTerminologyRow } from "@/test/fixtures";
import {
  buildStructureColors,
  buildStructureIndex
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

describe("buildStructureIndex", () => {
  it("indexes a row by its annotation value", () => {
    const row = makeTerminologyRow({ annotation_value: 8, identifier: 8 });

    const index = buildStructureIndex([row]);

    expect(index.get(8)).toBe(row);
  });

  it("returns undefined for a missing value", () => {
    const rows = [makeTerminologyRow({ annotation_value: 8 })];

    expect(buildStructureIndex(rows).get(999)).toBeUndefined();
  });

  it("omits rows with a non-positive or non-finite annotation value", () => {
    const rows = [
      makeTerminologyRow({ annotation_value: 0 }),
      makeTerminologyRow({ annotation_value: Number.NaN })
    ];

    expect(buildStructureIndex(rows).size).toBe(0);
  });

  it("returns an empty map for an empty row list", () => {
    expect(buildStructureIndex([]).size).toBe(0);
  });
});
