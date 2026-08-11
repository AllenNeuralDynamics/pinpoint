import { defineStore } from "pinia";
import type { CoordinateSystem } from "@/features/coordinate-system";
import {
  buildCoordinateSystem,
  buildCoordinateSystemNode,
  buildCoordinateSystemValue,
  buildFixedCoordinateSystemValue
} from "@/features/coordinate-system";
import { ref } from "vue";

export const useCoordinateSystemLibraryStore = defineStore(
  "coordinate-system-library",
  () => {
    const library = ref<CoordinateSystem[]>([
      buildCoordinateSystem(
        "Default",
        [
          buildCoordinateSystemNode(
            "Tip",
            [
              buildCoordinateSystemValue("ML"),
              buildCoordinateSystemValue("DV"),
              buildCoordinateSystemValue("AP")
            ],
            [
              buildCoordinateSystemValue("Pitch"),
              buildCoordinateSystemValue("Yaw"),
              buildCoordinateSystemValue("Roll")
            ]
          )
        ],
        true
      ),
      buildCoordinateSystem(
        "Surface Coordinate & Depth",
        [
          buildCoordinateSystemNode(
            "Surface Coordinate",
            [
              buildCoordinateSystemValue("ML"),
              buildCoordinateSystemValue("DV"),
              buildCoordinateSystemValue("AP")
            ],
            [
              buildCoordinateSystemValue("Pitch"),
              buildCoordinateSystemValue("Yaw"),
              buildCoordinateSystemValue("Roll")
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
              buildFixedCoordinateSystemValue()
            ]
          )
        ],
        true
      ),
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
      )
    ]);

    /**
     * Add a coordinate system to the library. Does nothing if its id is already present.
     * @param coordinateSystem Coordinate system to add.
     */
    function add(coordinateSystem: CoordinateSystem) {
      if (library.value.some(({ id }) => id === coordinateSystem.id)) return;
      library.value.push(coordinateSystem);
    }

    /**
     * Remove a coordinate system from the library by id. Index 0 is the pinned default and is
     * never removed.
     * @param coordinateSystem Coordinate system to remove.
     */
    function remove(coordinateSystem: CoordinateSystem) {
      const index = library.value.findIndex(
        ({ id }) => id === coordinateSystem.id
      );
      if (index < 1) return;
      library.value.splice(index, 1);
    }

    /**
     * Move a coordinate system within the library. Index 0 is the default system and is
     * pinned: it can be neither moved nor displaced.
     * @param fromIndex Index of the coordinate system to move.
     * @param toIndex Index to move it to.
     */
    function reorder(fromIndex: number, toIndex: number) {
      if (
        fromIndex === toIndex ||
        fromIndex < 1 ||
        toIndex < 1 ||
        fromIndex >= library.value.length ||
        toIndex >= library.value.length
      ) {
        return;
      }
      const [coordinateSystem] = library.value.splice(fromIndex, 1);
      library.value.splice(toIndex, 0, coordinateSystem!);
    }

    const state = { library };
    const actions = { add, remove, reorder };
    return { ...state, ...actions };
  },
  { persist: true }
);
