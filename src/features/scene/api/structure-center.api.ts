import type { Atlas, StructureEntity } from "@/features/atlas";
import { getAtlasCenter } from "@/features/atlas";
import { getStructureVertexPositions } from "./structures.api";
import { SCENE_AXIS_DIRECTIONS } from "./coordinate-transforms.api";
import type { AxisDirections } from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  convertCoordinate,
  getDirectionVector,
  getLineAxisIndex
} from "@/utils/coordinate-frame";
import type { AxisIndex } from "@/utils/axis-order";
import type { FloatArray, Scene } from "@babylonjs/core";

/** Half of the brain, split across the left-right line, a region center is taken from. */
export type Hemisphere = "left" | "right";

/**
 * Geometric center of each of a structure's hemispheres, or null for a
 * hemisphere holding no vertices.
 */
export interface HemisphereCenters {
  left: [number, number, number] | null;
  right: [number, number, number] | null;
}

/**
 * Index of the left-right axis in a structure's vertex positions, and the sign
 * turning a coordinate along it into a right-positive one. Resolved per call:
 * the scene barrel is imported in a cycle, so a module-level constant reading
 * `SCENE_AXIS_DIRECTIONS` can evaluate before that export is initialized.
 */
function midlineAxis(): { index: AxisIndex; rightwardSign: number } {
  const index = getLineAxisIndex(SCENE_AXIS_DIRECTIONS, "leftRight");
  return {
    index,
    // Canonical x is the animal's right, so the left-right axis's own canonical
    // component is +1 when the scene frame counts rightward and -1 when it
    // counts leftward; reading it keeps the split from ever mirroring.
    rightwardSign: getDirectionVector(SCENE_AXIS_DIRECTIONS[index])[0]!
  };
}

/**
 * Geometric center of both of a structure's hemispheres, from its mesh
 * vertices, in the given frame's mm relative to the atlas origin.
 * @param scene Scene to read or decode the structure's mesh through.
 * @param atlas Atlas whose center across the midline splits the hemispheres.
 * @param structure Entity information for the structure.
 * @param directions Axis directions to return the centers in.
 */
export async function getStructureHemisphereCenters(
  scene: Scene,
  atlas: Atlas,
  structure: StructureEntity,
  directions: AxisDirections
): Promise<HemisphereCenters> {
  const positions = await getStructureVertexPositions(scene, structure);
  const midlineMillimeters = convertCoordinate(
    ATLAS_AXIS_DIRECTIONS,
    SCENE_AXIS_DIRECTIONS,
    getAtlasCenter(atlas)
  )[midlineAxis().index]!;
  const inDirections = (
    center: [number, number, number] | null
  ): [number, number, number] | null =>
    center && convertCoordinate(SCENE_AXIS_DIRECTIONS, directions, center);

  return {
    left: inDirections(
      hemisphereCenterMillimeters(positions, midlineMillimeters, "left")
    ),
    right: inDirections(
      hemisphereCenterMillimeters(positions, midlineMillimeters, "right")
    )
  };
}

/**
 * Average the vertices on the animal's own left or right of the midline, in the
 * scene frame's mm, or null when that side holds none. Vertices exactly on the
 * midline count as right.
 * @param positions Flat vertex positions in the scene frame, relative to the atlas origin.
 * @param midlineMillimeters Midline coordinate along the scene frame's left-right axis, in mm.
 * @param hemisphere Side of the midline to average.
 */
export function hemisphereCenterMillimeters(
  positions: FloatArray,
  midlineMillimeters: number,
  hemisphere: Hemisphere
): [number, number, number] | null {
  const { index, rightwardSign } = midlineAxis();
  const totals: [number, number, number] = [0, 0, 0];
  let count = 0;

  for (let i = 0; i < positions.length; i += 3) {
    // Distance to the animal's right of the midline, negative on its left.
    const rightward =
      rightwardSign * (positions[i + index]! - midlineMillimeters);
    if (hemisphere === "right" ? rightward < 0 : rightward >= 0) continue;
    totals[0] += positions[i]!;
    totals[1] += positions[i + 1]!;
    totals[2] += positions[i + 2]!;
    count++;
  }

  if (count === 0) return null;
  return [totals[0] / count, totals[1] / count, totals[2] / count];
}
