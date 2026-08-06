import { defineStore } from "pinia";
import { ref } from "vue";
import type { CameraProjection } from "@/features/scene";
import type { PositionUnit, RotationUnit } from "@/utils/math";

export const usePreferencesStore = defineStore(
  "preferences",
  () => {
    /** Projection the scene camera renders with. */
    const cameraProjection = ref<CameraProjection>("perspective");

    /** Camera movement damping; 0 is snappy, 1 is smooth. */
    const cameraInertia = ref(0.9);

    /** Scene background color, as `#rrggbb`. */
    const worldBackgroundColor = ref("#33334d");

    /** Hemispheric light power. */
    const worldLightIntensity = ref(1);

    /** Specular reflection strength of every scene material, 0-1. */
    const materialSpecularIntensity = ref(1);

    /** Specular exponent of every scene material; higher is glossier. */
    const materialSpecularPower = ref(64);

    /** Whether see-through structures hide their own interior surfaces. */
    const areStructureInteriorsHidden = ref(true);

    /** Unit numeric inputs display positions in. */
    const positionUnit = ref<PositionUnit>("millimeter");

    /** Unit numeric inputs display rotations in. */
    const rotationUnit = ref<RotationUnit>("degree");

    /** Decimal places numeric inputs show. */
    const decimalPrecision = ref(3);

    /** Thickness of a probe's extruded shank, in mm. */
    const probeShankThicknessMillimeters = ref(0.05);

    /** Length of a probe's head stage cone, in mm. */
    const probeHeadStageLengthMillimeters = ref(20);

    /** How far the cutter block bites into a probe's head stage from its base, in mm. */
    const probeHeadStageCutDepthMillimeters = ref(17.5);

    /** Diameter of a probe's rod and of its head stage's top, in mm. */
    const probeRodDiameterMillimeters = ref(8);

    /** Length of a probe's rod, in mm. */
    const probeRodLengthMillimeters = ref(200);

    const state = {
      cameraProjection,
      cameraInertia,
      worldBackgroundColor,
      worldLightIntensity,
      materialSpecularIntensity,
      materialSpecularPower,
      areStructureInteriorsHidden,
      positionUnit,
      rotationUnit,
      decimalPrecision,
      probeShankThicknessMillimeters,
      probeHeadStageLengthMillimeters,
      probeHeadStageCutDepthMillimeters,
      probeRodDiameterMillimeters,
      probeRodLengthMillimeters
    };
    return { ...state };
  },
  { persist: true }
);
