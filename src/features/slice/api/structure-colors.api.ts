import type { TerminologyRow } from "@/features/atlas";

/**
 * Index terminology rows by annotation value, as both packed RGBA8 colors and
 * the rows themselves.
 * @param terminologyRows Parsed terminology rows for the atlas.
 */
export function buildStructureLookups(terminologyRows: TerminologyRow[]): {
  colors: Map<number, number>;
  index: Map<number, TerminologyRow>;
} {
  const colors = new Map<number, number>();
  const index = new Map<number, TerminologyRow>();
  for (const row of terminologyRows) {
    if (!Number.isFinite(row.annotation_value) || row.annotation_value <= 0) {
      continue;
    }
    colors.set(row.annotation_value, packColor(row.color_hex_triplet));
    index.set(row.annotation_value, row);
  }
  return { colors, index };
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
