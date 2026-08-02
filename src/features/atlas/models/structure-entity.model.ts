import type { Color3 } from "@babylonjs/core";

/**
 * Structure 3D mesh entity config for Babylon.
 */
export interface StructureEntity {
  /**
   * Terminology identifier of the structure. Babylon mesh and material
   * names are derived from this, not from the structure's display name.
   */
  identifier: number;
  meshPath: string;
  color: Color3;
}
