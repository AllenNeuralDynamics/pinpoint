import { computed, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import { getAxisSlots, type AxisSlot } from "@/utils/axis-order";
import { usePreferencesStore } from "@/stores/preferences.store";

/** Built-in label message keys per atlas position axis, indexed by the internal triple. */
const POSITION_AXIS_MESSAGE_KEYS = ["axis.ap", "axis.dv", "axis.ml"] as const;

/** Built-in label message keys per atlas rotation axis, indexed by the internal triple. */
const ROTATION_AXIS_MESSAGE_KEYS = [
  "axis.roll",
  "axis.yaw",
  "axis.pitch"
] as const;

/** Which atlas triple an input edits. */
export type AtlasAxisKind = "position" | "rotation";

/** Display-ordered, labelled atlas axes plus their built-in labels. */
export interface AtlasAxes {
  position: ComputedRef<AxisSlot[]>;
  rotation: ComputedRef<AxisSlot[]>;
  positionDefaultNames: ComputedRef<[string, string, string]>;
  rotationDefaultNames: ComputedRef<[string, string, string]>;
}

/**
 * Atlas position and rotation axes in the user's preferred order, each labelled
 * by its user name or its built-in label.
 */
export function useAtlasAxes(): AtlasAxes {
  const preferences = usePreferencesStore();
  const { t } = useI18n();

  const positionDefaultNames = computed(
    () =>
      POSITION_AXIS_MESSAGE_KEYS.map(key => t(key)) as [string, string, string]
  );
  const rotationDefaultNames = computed(
    () =>
      ROTATION_AXIS_MESSAGE_KEYS.map(key => t(key)) as [string, string, string]
  );

  return {
    positionDefaultNames,
    rotationDefaultNames,
    position: computed(() =>
      getAxisSlots(
        preferences.positionAxisOrder,
        preferences.positionAxisNames,
        positionDefaultNames.value
      )
    ),
    rotation: computed(() =>
      getAxisSlots(
        preferences.rotationAxisOrder,
        preferences.rotationAxisNames,
        rotationDefaultNames.value
      )
    )
  };
}
