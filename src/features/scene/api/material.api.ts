import type { Color3, Material, StandardMaterial } from "@babylonjs/core";

/**
 * Set a material's alpha, skipping the update when unchanged.
 * @param material Material to set the alpha of.
 * @param alpha Alpha to set.
 */
export function setMaterialAlpha(material: Material, alpha: number): void {
  if (material.alpha === alpha) return;

  material.alpha = alpha;
  material.markDirty(true);
}

/**
 * Set a material's diffuse color, skipping the update when unchanged.
 * @param material Material to set the diffuse color of.
 * @param diffuseColor Diffuse color to set.
 */
export function setMaterialDiffuseColor(
  material: StandardMaterial,
  diffuseColor: Color3
): void {
  if (material.diffuseColor.equals(diffuseColor)) return;

  material.diffuseColor = diffuseColor;
  material.markDirty(true);
}
