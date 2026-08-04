import type { TerminologyRow } from "@/features/atlas";

/**
 * Map annotation values to packed little-endian RGBA8 colors.
 * @param terminologyRows Parsed terminology rows for the atlas.
 */
export function buildStructureColors(
  terminologyRows: TerminologyRow[]
): Map<number, number> {
  const colors = new Map<number, number>();
  for (const row of terminologyRows) {
    if (!Number.isFinite(row.annotation_value) || row.annotation_value <= 0) {
      continue;
    }
    colors.set(row.annotation_value, packColor(row.color_hex_triplet));
  }
  return colors;
}

/**
 * Index terminology rows by annotation value, for constant-time structure
 * lookups during hover and label resolution.
 * @param terminologyRows Parsed terminology rows for the atlas.
 */
export function buildStructureIndex(
  terminologyRows: TerminologyRow[]
): Map<number, TerminologyRow> {
  const index = new Map<number, TerminologyRow>();
  for (const row of terminologyRows) {
    if (!Number.isFinite(row.annotation_value) || row.annotation_value <= 0) {
      continue;
    }
    index.set(row.annotation_value, row);
  }
  return index;
}

/**
 * Pack a `#RRGGBB` hex triplet into a fully opaque, little-endian RGBA8
 * value, matching the byte order `Uint8ClampedArray`-backed `ImageData` expects.
 * @param colorHexTriplet Hex triplet to pack, e.g. `#BFDAE3`.
 */
function packColor(colorHexTriplet: string): number {
  const red = Number.parseInt(colorHexTriplet.slice(1, 3), 16);
  const green = Number.parseInt(colorHexTriplet.slice(3, 5), 16);
  const blue = Number.parseInt(colorHexTriplet.slice(5, 7), 16);
  return (0xff000000 | (blue << 16) | (green << 8) | red) >>> 0;
}
