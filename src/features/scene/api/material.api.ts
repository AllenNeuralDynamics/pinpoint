import { Color3, StandardMaterial } from "@babylonjs/core";
import type { Material, Observer, Scene } from "@babylonjs/core";

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

/**
 * Set a material's emissive color, skipping the update when unchanged.
 * @param material Material to set the emissive color of.
 * @param emissiveColor Emissive color to set.
 */
export function setMaterialEmissiveColor(
  material: StandardMaterial,
  emissiveColor: Color3
): void {
  if (material.emissiveColor.equals(emissiveColor)) return;

  material.emissiveColor = emissiveColor;
  material.markDirty(true);
}

/** Shared specular shading settings applied to every standard material in a scene. */
export interface SurfaceMaterialSettings {
  /** Specular reflection strength, 0-1, applied as a grey specular color. */
  specularIntensity: number;
  /** Specular exponent; higher is a tighter, glossier highlight. */
  specularPower: number;
}

/**
 * Apply specular settings to a material, skipping unchanged values and marking
 * it dirty so a frozen material still picks the change up.
 * @param material Material to apply the settings to.
 * @param settings Specular settings to apply.
 */
export function applySurfaceMaterialSettings(
  material: StandardMaterial,
  settings: SurfaceMaterialSettings
): void {
  const specular = new Color3(
    settings.specularIntensity,
    settings.specularIntensity,
    settings.specularIntensity
  );
  if (
    material.specularColor.equals(specular) &&
    material.specularPower === settings.specularPower
  )
    return;

  material.specularColor = specular;
  material.specularPower = settings.specularPower;
  material.markDirty(true);
}

/**
 * Apply specular settings to every standard material already in a scene.
 * @param scene Scene whose materials to update.
 * @param settings Specular settings to apply.
 */
export function syncSceneMaterials(
  scene: Scene,
  settings: SurfaceMaterialSettings
): void {
  for (const material of scene.materials) {
    if (material instanceof StandardMaterial)
      applySurfaceMaterialSettings(material, settings);
  }
}

/**
 * Apply specular settings to every standard material added to a scene from now
 * on, reading the settings fresh for each one.
 * @param scene Scene to observe new materials on.
 * @param getSettings Getter for the settings to apply.
 */
export function applySurfaceMaterialSettingsToNewMaterials(
  scene: Scene,
  getSettings: () => SurfaceMaterialSettings
): Observer<Material> {
  return scene.onNewMaterialAddedObservable.add(material => {
    if (material instanceof StandardMaterial)
      applySurfaceMaterialSettings(material, getSettings());
  });
}
