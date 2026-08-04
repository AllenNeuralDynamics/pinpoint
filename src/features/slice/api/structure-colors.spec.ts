import { describe, expect, it } from "vitest";
import { makeTerminologyRow } from "@/test/fixtures";
import { buildStructureLookups } from "./structure-colors.api";

describe("buildStructureLookups", () => {
  it("maps each row's annotation value to its packed color", () => {
    const rows = [
      makeTerminologyRow({ annotation_value: 8, color_hex_triplet: "#BFDAE3" }),
      makeTerminologyRow({
        annotation_value: 997,
        color_hex_triplet: "#FFFFFF"
      })
    ];

    const { colors } = buildStructureLookups(rows);

    expect(colors.size).toBe(2);
    expect(colors.has(8)).toBe(true);
    expect(colors.has(997)).toBe(true);
  });

  it("packs a hex triplet into the correct RGBA8 bytes, read back little-endian", () => {
    const rows = [
      makeTerminologyRow({ annotation_value: 1, color_hex_triplet: "#B0F0FF" })
    ];

    const { colors } = buildStructureLookups(rows);
    const packed = colors.get(1)!;

    const bytes = new Uint8ClampedArray(new Uint32Array([packed]).buffer);
    expect(Array.from(bytes)).toEqual([0xb0, 0xf0, 0xff, 0xff]);
  });

  it("skips rows with a non-positive annotation value", () => {
    const rows = [makeTerminologyRow({ annotation_value: 0 })];

    const { colors, index } = buildStructureLookups(rows);
    expect(colors.size).toBe(0);
    expect(index.size).toBe(0);
  });

  it("skips rows with a non-finite annotation value", () => {
    const rows = [makeTerminologyRow({ annotation_value: Number.NaN })];

    const { colors, index } = buildStructureLookups(rows);
    expect(colors.size).toBe(0);
    expect(index.size).toBe(0);
  });

  it("indexes a row by its annotation value", () => {
    const row = makeTerminologyRow({ annotation_value: 8, identifier: 8 });

    const { index } = buildStructureLookups([row]);

    expect(index.get(8)).toBe(row);
  });

  it("returns undefined for a missing value", () => {
    const rows = [makeTerminologyRow({ annotation_value: 8 })];

    expect(buildStructureLookups(rows).index.get(999)).toBeUndefined();
  });

  it("returns empty maps for an empty row list", () => {
    const { colors, index } = buildStructureLookups([]);
    expect(colors.size).toBe(0);
    expect(index.size).toBe(0);
  });
});
