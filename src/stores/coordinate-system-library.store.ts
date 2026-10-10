import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { i18n } from "@/services/i18n.service";
import {
  type CoordinateSystem,
  buildCoordinateSystem,
  buildCoordinateSystemNode,
  buildCoordinateSystemValue,
  buildFixedCoordinateSystemValue,
  buildBrainTransformNode,
  isBrainTransformNode,
  isCoordinateSystem
} from "@/features/coordinate-system";

const SURFACE_DEPTH_PRESETS = [
  {
    id: "surface-coordinate-depth",
    nameKey: "coordinateSystemPresets.surfaceDepth",
    anatomical: false
  },
  {
    id: "surface-coordinate-depth-anatomical",
    nameKey: "coordinateSystemPresets.surfaceDepthAnatomical",
    anatomical: true
  }
] as const;

export const useCoordinateSystemLibraryStore = defineStore(
  "coordinate-system-library",
  () => {
    const sharedBrainTransform = ref(buildBrainTransformNode());
    const library = ref<CoordinateSystem[]>([
      buildSurfaceDepthSystem(),
      buildCoordinateSystem(
        "NewScale MIS",
        [
          buildCoordinateSystemNode(
            "Arc",
            [
              buildFixedCoordinateSystemValue(),
              buildFixedCoordinateSystemValue(),
              buildFixedCoordinateSystemValue()
            ],
            [
              buildCoordinateSystemValue("Arc Angle"),
              buildFixedCoordinateSystemValue(),
              buildFixedCoordinateSystemValue()
            ]
          ),
          buildCoordinateSystemNode(
            "Module",
            [
              buildFixedCoordinateSystemValue(),
              buildFixedCoordinateSystemValue(),
              buildFixedCoordinateSystemValue()
            ],
            [
              buildFixedCoordinateSystemValue(),
              buildCoordinateSystemValue("Module Angle"),
              buildFixedCoordinateSystemValue()
            ]
          ),
          buildCoordinateSystemNode(
            "Stage",
            [
              buildCoordinateSystemValue("X"),
              buildCoordinateSystemValue("Y"),
              buildCoordinateSystemValue("Z")
            ],
            [
              buildFixedCoordinateSystemValue(),
              buildFixedCoordinateSystemValue(),
              buildFixedCoordinateSystemValue()
            ],
            [0, 1, 2],
            [0, 1, 2],
            true
          ),
          buildCoordinateSystemNode(
            "Depth",
            [
              buildFixedCoordinateSystemValue(),
              buildFixedCoordinateSystemValue(),
              buildCoordinateSystemValue("Depth")
            ],
            [
              buildFixedCoordinateSystemValue(),
              buildFixedCoordinateSystemValue(),
              buildCoordinateSystemValue("Roll")
            ]
          )
        ],
        true
      ),
      buildSurfaceDepthSystem(SURFACE_DEPTH_PRESETS[1])
    ]);
    restoreBrainTransformReferences();

    const surfaceDepthPresets = computed(() =>
      SURFACE_DEPTH_PRESETS.map(({ id, nameKey, anatomical }) => ({
        id,
        name: i18n.global.t(nameKey),
        anatomical
      }))
    );
    const missingSurfaceDepthPresets = computed(() =>
      surfaceDepthPresets.value.filter(
        preset => !findSurfaceDepthSystem(library.value, preset)
      )
    );

    /**
     * Return a surface/depth preset, creating it when explicitly chosen outside the library.
     * @param anatomical Whether to use sagittal/coronal input controls.
     */
    function getSurfaceDepthCoordinateSystem(
      anatomical = false
    ): CoordinateSystem {
      const preset = SURFACE_DEPTH_PRESETS[anatomical ? 1 : 0];
      return (
        findSurfaceDepthSystem(library.value, preset) ??
        add(buildSurfaceDepthSystem(preset))
      );
    }

    /**
     * Return the existing library entry or add the given coordinate system.
     * @param coordinateSystem Coordinate system to add.
     */
    function add(coordinateSystem: CoordinateSystem): CoordinateSystem {
      const existing = library.value.find(
        ({ id }) => id === coordinateSystem.id
      );
      if (existing) return existing;
      if (coordinateSystem.brainTransform.shared)
        coordinateSystem.brainTransform = sharedBrainTransform.value;
      library.value.push(coordinateSystem);
      return library.value.at(-1)!;
    }

    /**
     * Remove a coordinate system from the library by id.
     * @param coordinateSystem Coordinate system to remove.
     */
    function remove(coordinateSystem: CoordinateSystem) {
      const index = library.value.findIndex(
        ({ id }) => id === coordinateSystem.id
      );
      if (index === -1) return;
      library.value.splice(index, 1);
    }

    /**
     * Move a coordinate system within the library.
     * @param fromIndex Index of the coordinate system to move.
     * @param toIndex Index to move it to.
     */
    function reorder(fromIndex: number, toIndex: number) {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= library.value.length ||
        toIndex >= library.value.length
      ) {
        return;
      }
      const [coordinateSystem] = library.value.splice(fromIndex, 1);
      library.value.splice(toIndex, 0, coordinateSystem!);
    }

    /**
     * Share the library root or detach a copy of its current values.
     * @param coordinateSystem Coordinate system whose root to change.
     * @param shared Whether to adopt the shared root.
     */
    function setBrainTransformShared(
      coordinateSystem: CoordinateSystem,
      shared: boolean
    ): void {
      coordinateSystem.brainTransform = shared
        ? sharedBrainTransform.value
        : {
            ...JSON.parse(JSON.stringify(coordinateSystem.brainTransform)),
            shared: false
          };
    }

    /** Restore shared root references after JSON serialization. */
    function restoreBrainTransformReferences(): void {
      for (const system of library.value) {
        if (system.brainTransform.shared)
          system.brainTransform = sharedBrainTransform.value;
      }
    }

    const state = { library, sharedBrainTransform };
    const getters = { surfaceDepthPresets, missingSurfaceDepthPresets };
    const actions = {
      getSurfaceDepthCoordinateSystem,
      add,
      remove,
      reorder,
      setBrainTransformShared,
      restoreBrainTransformReferences
    };
    return { ...state, ...getters, ...actions };
  },
  {
    persist: {
      serializer: {
        serialize: JSON.stringify,
        deserialize: text => {
          const data = JSON.parse(text);
          if (
            !isBrainTransformNode(data.sharedBrainTransform) ||
            !data.sharedBrainTransform.shared ||
            !Array.isArray(data.library) ||
            !data.library.every(isCoordinateSystem)
          )
            throw new Error("Invalid coordinate system library");
          return data;
        }
      },
      afterHydrate: context => {
        context.store.restoreBrainTransformReferences();
      }
    }
  }
);

/**
 * Find a preset by identity or an existing compatible surface/depth chain.
 * @param library Coordinate systems to search without modifying them.
 * @param preset Preset identity and rotation input convention.
 */
function findSurfaceDepthSystem(
  library: CoordinateSystem[],
  preset: { id: string; anatomical: boolean }
): CoordinateSystem | undefined {
  return (
    library.find(system => system.id === preset.id) ??
    library.find(system => {
      const [surface, depth] = system.chain;
      return (
        system.offsetByReferenceCoordinate &&
        system.chain.length === 2 &&
        surface &&
        depth &&
        surface.onSurface &&
        !depth.onSurface &&
        (surface.rotationInput === "anatomical") === preset.anatomical &&
        [...surface.position, ...surface.rotation].every(
          entry => entry.mode === "free"
        ) &&
        depth.position[2].mode === "free" &&
        [...depth.position.slice(0, 2), ...depth.rotation].every(
          entry => entry.mode === "fixed" && entry.value === 0
        )
      );
    })
  );
}

/**
 * Build a localized surface/depth preset with the chosen rotation inputs.
 * @param preset Preset identity, label, and rotation input convention.
 */
function buildSurfaceDepthSystem(
  preset: (typeof SURFACE_DEPTH_PRESETS)[number] = SURFACE_DEPTH_PRESETS[0]
): CoordinateSystem {
  const { id, nameKey, anatomical } = preset;
  const t = i18n.global.t;
  const surface = buildCoordinateSystemNode(
    t("coordinateSystemPresets.surface"),
    [
      buildCoordinateSystemValue(t("axis.ml")),
      buildCoordinateSystemValue(t("axis.dv")),
      buildCoordinateSystemValue(t("axis.ap"))
    ],
    [
      buildCoordinateSystemValue(
        t(anatomical ? "axis.sagittal" : "axis.pitch"),
        Math.PI / 2
      ),
      buildCoordinateSystemValue(t(anatomical ? "axis.coronal" : "axis.yaw")),
      buildCoordinateSystemValue(t("axis.roll"))
    ],
    [0, 1, 2],
    [0, 1, 2],
    true
  );
  if (anatomical) surface.rotationInput = "anatomical";
  const system = buildCoordinateSystem(
    t(nameKey),
    [
      surface,
      buildCoordinateSystemNode(
        t("coordinateSystemPresets.depth"),
        [
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue(),
          buildCoordinateSystemValue(t("coordinateSystemPresets.depth"))
        ],
        [
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue(),
          buildFixedCoordinateSystemValue()
        ]
      )
    ],
    true
  );
  system.id = id;
  return system;
}
