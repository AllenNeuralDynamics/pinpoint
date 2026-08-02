import { defineStore } from "pinia";
import { ref } from "vue";
import type { ProbeInterfaceProbe } from "@/features/probe";
import {
  findProbeInterfaceProbeByIdentifier,
  getProbeInterfaceIdentifier
} from "@/features/probe";

export const useProbeLibraryStore = defineStore(
  "probe-library",
  () => {
    /** Installed probe interface definitions. */
    const library = ref<ProbeInterfaceProbe[]>([]);

    /**
     * Add a probe to the library. Does nothing if it already exists.
     * @param probe Probe to add.
     */
    function add(probe: ProbeInterfaceProbe) {
      const identifier = getProbeInterfaceIdentifier(probe);
      if (findProbeInterfaceProbeByIdentifier(library.value, identifier)) {
        return;
      }
      library.value.push(probe);
    }

    /**
     * Remove all instances of a probe from the library.
     * @param probe Probe to remove.
     */
    function remove(probe: ProbeInterfaceProbe) {
      const identifier = getProbeInterfaceIdentifier(probe);
      for (let i = library.value.length - 1; i >= 0; i--) {
        if (getProbeInterfaceIdentifier(library.value[i]!) === identifier) {
          library.value.splice(i, 1);
        }
      }
    }

    /**
     * Move a probe within the library from one index to another.
     * @param fromIndex Index of the probe to move.
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
      const [probe] = library.value.splice(fromIndex, 1);
      library.value.splice(toIndex, 0, probe!);
    }

    const state = { library };
    const actions = { add, remove, reorder };
    return { ...state, ...actions };
  },
  { persist: true }
);
