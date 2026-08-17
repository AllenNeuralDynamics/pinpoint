import { defineStore } from "pinia";
import { type Ref, ref } from "vue";
import type { Appearance } from "@/features/preferences";
import type { CameraProjection } from "@/features/scene";
import {
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  type GlobalCoordinateSystem,
  type LocalCoordinateSystem
} from "@/utils/coordinate-frame";
import type { PositionUnit, RotationUnit } from "@/utils/math";

/** Every preference value the store holds. */
export interface Preferences {
  /** Semantic version of Pinpoint that last wrote these preferences. */
  version: string;
  /** Theme the app renders with; `auto` follows the OS preference. */
  appearance: Appearance;
  /** Whether the splash dialog is suppressed when Pinpoint starts. */
  isSplashScreenSkipped: boolean;
  /** Projection the scene camera renders with. */
  cameraProjection: CameraProjection;
  /** Camera movement damping; 0 is snappy, 1 is smooth. */
  cameraInertia: number;
  /** Scene background color while the app renders light, as `#rrggbb`. */
  worldBackgroundColorLightMode: string;
  /** Scene background color while the app renders dark, as `#rrggbb`. */
  worldBackgroundColorDarkMode: string;
  /** Hemispheric light power. */
  worldLightIntensity: number;
  /** Specular reflection strength of every scene material, 0-1. */
  materialSpecularIntensity: number;
  /** Specular exponent of every scene material; higher is glossier. */
  materialSpecularPower: number;
  /** Whether the scene renders with screen-space ambient occlusion. */
  isSsaoEnabled: boolean;
  /** Size of the ambient occlusion pass relative to the canvas, 0-1; lower is faster. */
  ssaoRatio: number;
  /** Alpha faded (unselected) structures render with, 0-1. */
  structureFadedAlpha: number;
  /** Whether see-through structures hide their own interior surfaces. */
  areStructureInteriorsHidden: boolean;
  /** Unit numeric inputs display positions in. */
  positionUnit: PositionUnit;
  /** Unit numeric inputs display rotations in. */
  rotationUnit: RotationUnit;
  /** Coordinate system new experiments express their coordinates in. */
  newSceneGlobalCoordinateSystem: GlobalCoordinateSystem;
  /** Orientation probes in new experiments rest in. */
  newSceneLocalCoordinateSystem: LocalCoordinateSystem;
  /** Whether edits to the current scene's coordinate systems become the defaults for new scenes. */
  areCoordinateSystemsRetained: boolean;
  /** Decimal places numeric inputs show. */
  decimalPrecision: number;
  /** Multiplier on how far a numeric input's value moves per pixel of horizontal drag. */
  dragSensitivity: number;
  /** Thickness of a probe's extruded shank, in mm. */
  probeShankThicknessMillimeters: number;
  /** Length of a probe's head stage cone, in mm. */
  probeHeadStageLengthMillimeters: number;
  /** How far the cutter block bites into a probe's head stage from its base, in mm. */
  probeHeadStageCutDepthMillimeters: number;
  /** Diameter of a probe's rod and of its head stage's top, in mm. */
  probeRodDiameterMillimeters: number;
  /** Length of a probe's rod, in mm. */
  probeRodLengthMillimeters: number;
}

/** Starting 3D viewport background in light mode: Allen Institute Page 1. */
export const DEFAULT_WORLD_BACKGROUND_COLOR_LIGHT = "#f3f0e8";

/** Starting 3D viewport background in dark mode: the dark card surface. */
export const DEFAULT_WORLD_BACKGROUND_COLOR_DARK = "#1a1a1a";

export const usePreferencesStore = defineStore(
  "preferences",
  () => {
    const version = ref(import.meta.env.APP_VERSION);
    const appearance = ref<Appearance>("auto");
    const isSplashScreenSkipped = ref(false);
    const cameraProjection = ref<CameraProjection>("perspective");
    const cameraInertia = ref(0.9);
    const worldBackgroundColorLightMode = ref(
      DEFAULT_WORLD_BACKGROUND_COLOR_LIGHT
    );
    const worldBackgroundColorDarkMode = ref(
      DEFAULT_WORLD_BACKGROUND_COLOR_DARK
    );
    const worldLightIntensity = ref(1);
    const materialSpecularIntensity = ref(1);
    const materialSpecularPower = ref(64);
    const isSsaoEnabled = ref(false);
    const ssaoRatio = ref(0.5);
    const structureFadedAlpha = ref(0.2);
    const areStructureInteriorsHidden = ref(false);
    const positionUnit = ref<PositionUnit>("millimeter");
    const rotationUnit = ref<RotationUnit>("degree");
    const newSceneGlobalCoordinateSystem = ref<GlobalCoordinateSystem>(
      buildDefaultGlobalCoordinateSystem()
    );
    const newSceneLocalCoordinateSystem = ref<LocalCoordinateSystem>(
      buildDefaultLocalCoordinateSystem()
    );
    const areCoordinateSystemsRetained = ref(false);
    const decimalPrecision = ref(3);
    const dragSensitivity = ref(1);
    const probeShankThicknessMillimeters = ref(0.05);
    const probeHeadStageLengthMillimeters = ref(20);
    const probeHeadStageCutDepthMillimeters = ref(17.5);
    const probeRodDiameterMillimeters = ref(8);
    const probeRodLengthMillimeters = ref(200);

    // `satisfies` keeps the store's state and `Preferences` in lockstep: a new
    // preference must appear in both.
    const state = {
      version,
      appearance,
      isSplashScreenSkipped,
      cameraProjection,
      cameraInertia,
      worldBackgroundColorLightMode,
      worldBackgroundColorDarkMode,
      worldLightIntensity,
      materialSpecularIntensity,
      materialSpecularPower,
      isSsaoEnabled,
      ssaoRatio,
      structureFadedAlpha,
      areStructureInteriorsHidden,
      positionUnit,
      rotationUnit,
      newSceneGlobalCoordinateSystem,
      newSceneLocalCoordinateSystem,
      areCoordinateSystemsRetained,
      decimalPrecision,
      dragSensitivity,
      probeShankThicknessMillimeters,
      probeHeadStageLengthMillimeters,
      probeHeadStageCutDepthMillimeters,
      probeRodDiameterMillimeters,
      probeRodLengthMillimeters
    } satisfies { [K in keyof Preferences]: Ref<Preferences[K]> };
    return { ...state };
  },
  { persist: true }
);
