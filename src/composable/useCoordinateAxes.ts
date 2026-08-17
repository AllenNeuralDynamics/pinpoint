import { computed, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import { getAxisSlots, type AxisSlot } from "@/utils/axis-order";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import {
  getPositionAxisMessageKey,
  getRotationAxisMessageKey,
  type CoordinateAxis
} from "@/utils/coordinate-frame";

/** Which of the experiment's triples an input edits. */
export type CoordinateAxisKind = "position" | "rotation";

/**
 * Display-ordered, labelled axes of the experiment's global coordinate system,
 * plus the built-in label each axis falls back to.
 */
export interface CoordinateAxes {
  position: ComputedRef<AxisSlot[]>;
  rotation: ComputedRef<AxisSlot[]>;
  positionDefaultNames: ComputedRef<[string, string, string]>;
  rotationDefaultNames: ComputedRef<[string, string, string]>;
}

/**
 * Position and rotation axes of the experiment's global coordinate system, in
 * the order it displays them, each labelled by its user name or, when that is
 * empty, by the built-in label of the anatomical line it runs along.
 */
export function useCoordinateAxes(): CoordinateAxes {
  const currentExperiment = useCurrentExperimentStore();
  const { t } = useI18n();

  const system = computed(() => currentExperiment.globalCoordinateSystem);

  const positionDefaultNames = computed(() =>
    getAxisNames(system.value.axes, axis =>
      t(getPositionAxisMessageKey(axis.direction))
    )
  );
  const rotationDefaultNames = computed(() =>
    getAxisNames(system.value.axes, axis =>
      t(getRotationAxisMessageKey(axis.direction))
    )
  );

  return {
    positionDefaultNames,
    rotationDefaultNames,
    position: computed(() =>
      getAxisSlots(
        system.value.positionDisplayOrder,
        getAxisNames(system.value.axes, axis => axis.positionName),
        positionDefaultNames.value
      )
    ),
    rotation: computed(() =>
      getAxisSlots(
        system.value.rotationDisplayOrder,
        getAxisNames(system.value.axes, axis => axis.rotationName),
        rotationDefaultNames.value
      )
    )
  };
}

/**
 * Name of each of a coordinate system's three axes, in triple order.
 * @param axes Axes of the coordinate system to read.
 * @param getName Reads one axis's name.
 */
function getAxisNames(
  axes: readonly [CoordinateAxis, CoordinateAxis, CoordinateAxis],
  getName: (axis: CoordinateAxis) => string
): [string, string, string] {
  return [getName(axes[0]), getName(axes[1]), getName(axes[2])];
}
