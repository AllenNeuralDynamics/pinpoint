import type { Atlas, StructureEntity } from "@/features/atlas";
import { getAtlasCenter } from "@/features/atlas";
import { getStructureVertexPositions } from "./structures.api";
import type { FloatArray, Scene } from "@babylonjs/core";

/** Half of the brain, split across the ML axis, that a region center is taken from. */
export type Hemisphere = "left" | "right";

/**
 * Geometric center of each of a structure's hemispheres, in atlas ASR mm, or null
 * for a hemisphere holding no vertices.
 */
export interface HemisphereCenters {
  left: [number, number, number] | null;
  right: [number, number, number] | null;
}

/**
 * Geometric center of both of a structure's hemispheres, from its mesh vertices.
 * @param scene Scene to read or decode the structure's mesh through.
 * @param atlas Atlas whose ML center is the midline.
 * @param structure Entity information for the structure.
 */
export async function getStructureHemisphereCenters(
  scene: Scene,
  atlas: Atlas,
  structure: StructureEntity
): Promise<HemisphereCenters> {
  const positions = await getStructureVertexPositions(scene, structure);
  const midlineMillimeters = getAtlasCenter(atlas)[2];
  return {
    left: hemisphereCenterMillimeters(positions, midlineMillimeters, "left"),
    right: hemisphereCenterMillimeters(positions, midlineMillimeters, "right")
  };
}

/**
 * Average the vertices on one side of the ML midline, in atlas ASR mm, or null when
 * that side holds none. Vertices exactly on the midline count as right.
 * @param positions Flat vertex positions in atlas-local mm, as (ML, DV, AP) triples.
 * @param midlineMillimeters ML coordinate of the atlas midline, in mm.
 * @param hemisphere Side of the midline to average.
 */
export function hemisphereCenterMillimeters(
  positions: FloatArray,
  midlineMillimeters: number,
  hemisphere: Hemisphere
): [number, number, number] | null {
  let anterior = 0;
  let superior = 0;
  let right = 0;
  let count = 0;

  for (let i = 0; i < positions.length; i += 3) {
    const ml = positions[i]!;
    if (
      hemisphere === "right"
        ? ml < midlineMillimeters
        : ml >= midlineMillimeters
    ) {
      continue;
    }
    right += ml;
    superior += positions[i + 1]!;
    anterior += positions[i + 2]!;
    count++;
  }

  if (count === 0) return null;
  return [anterior / count, superior / count, right / count];
}
