import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mountWithQuasar } from "@/test/mount-helper";
import type { CoordinateAxes } from "./useCoordinateAxes";
import { useCoordinateAxes } from "./useCoordinateAxes";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  buildCoordinateAxis,
  type GlobalCoordinateSystem
} from "@/utils/coordinate-frame";
import { getTerminologyRows } from "@/features/atlas";

// `useCoordinateAxes` reads the current experiment store, whose terminology
// rows would otherwise be fetched from the atlas source.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

beforeEach(() => {
  vi.mocked(getTerminologyRows).mockResolvedValue([]);
});

/**
 * Mount a throwaway component so `useCoordinateAxes`' `useI18n` call has a real
 * component setup context, backed by the app's actual en-US messages and a
 * fresh Pinia instance.
 */
function mountCoordinateAxes(): CoordinateAxes {
  let axes!: CoordinateAxes;
  mountWithQuasar(
    defineComponent({
      setup() {
        axes = useCoordinateAxes();
        return () => null;
      }
    })
  );
  return axes;
}

describe("useCoordinateAxes", () => {
  describe("positionDefaultNames", () => {
    it("labels each axis by the anatomical line it runs along", () => {
      expect(mountCoordinateAxes().positionDefaultNames.value).toEqual([
        "ML",
        "AP",
        "SI"
      ]);
    });

    it("follows the axes when the coordinate system reorders them", () => {
      const axes = mountCoordinateAxes();
      const currentExperiment = useCurrentExperimentStore();

      currentExperiment.setGlobalCoordinateSystem(makeAtlasOrderedSystem());

      expect(axes.positionDefaultNames.value).toEqual(["AP", "SI", "ML"]);
    });
  });

  describe("rotationDefaultNames", () => {
    it("labels each axis by the rotation about the line it runs along", () => {
      expect(mountCoordinateAxes().rotationDefaultNames.value).toEqual([
        "Pitch",
        "Roll",
        "Yaw"
      ]);
    });

    it("follows the axes when the coordinate system reorders them", () => {
      const axes = mountCoordinateAxes();
      const currentExperiment = useCurrentExperimentStore();

      currentExperiment.setGlobalCoordinateSystem(makeAtlasOrderedSystem());

      expect(axes.rotationDefaultNames.value).toEqual(["Roll", "Yaw", "Pitch"]);
    });
  });

  describe("position", () => {
    it("returns the built-in labels in the system's display order", () => {
      expect(mountCoordinateAxes().position.value).toEqual([
        { axis: 0, label: "ML" },
        { axis: 1, label: "AP" },
        { axis: 2, label: "SI" }
      ]);
    });

    it("reflects the coordinate system's order and names reactively", () => {
      const axes = mountCoordinateAxes();
      const currentExperiment = useCurrentExperimentStore();
      const system = currentExperiment.globalCoordinateSystem;

      system.positionDisplayOrder = [2, 1, 0];
      system.axes[1].positionName = "Bregma AP";

      expect(axes.position.value).toEqual([
        { axis: 2, label: "SI" },
        { axis: 1, label: "Bregma AP" },
        { axis: 0, label: "ML" }
      ]);
    });
  });

  describe("rotation", () => {
    it("returns the built-in labels in the system's display order", () => {
      expect(mountCoordinateAxes().rotation.value).toEqual([
        { axis: 0, label: "Pitch" },
        { axis: 1, label: "Roll" },
        { axis: 2, label: "Yaw" }
      ]);
    });

    it("takes its order and names from the rotation display order alone", () => {
      const axes = mountCoordinateAxes();
      const currentExperiment = useCurrentExperimentStore();
      const system = currentExperiment.globalCoordinateSystem;

      system.rotationDisplayOrder = [1, 0, 2];
      system.axes[0].rotationName = "Tilt";
      system.axes[0].positionName = "Bregma ML";

      expect(axes.rotation.value).toEqual([
        { axis: 1, label: "Roll" },
        { axis: 0, label: "Tilt" },
        { axis: 2, label: "Yaw" }
      ]);
      expect(axes.position.value[0]).toEqual({ axis: 0, label: "Bregma ML" });
    });
  });
});

/** Global coordinate system whose axes run along the atlas's own. */
function makeAtlasOrderedSystem(): GlobalCoordinateSystem {
  return {
    axes: [
      buildCoordinateAxis("Anterior_to_posterior"),
      buildCoordinateAxis("Superior_to_inferior"),
      buildCoordinateAxis("Right_to_left")
    ],
    positionDisplayOrder: [0, 1, 2],
    rotationDisplayOrder: [0, 1, 2]
  };
}
