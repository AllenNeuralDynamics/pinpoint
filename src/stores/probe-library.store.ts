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

    const state = { library };
    const actions = { add, remove };
    return { ...state, ...actions };
  },
  { persist: true }
);
