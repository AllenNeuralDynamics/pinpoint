export { default as NewExperimentDialog } from "./components/NewExperimentDialog.vue";
export { default as RecentExperimentsDialog } from "./components/RecentExperimentsDialog.vue";
export { default as RecentExperimentsList } from "./components/RecentExperimentsList.vue";
export { default as ExperimentPropertiesDialog } from "./components/ExperimentPropertiesDialog.vue";
export { useExperimentFile } from "./composable/useExperimentFile";
export type { Experiment } from "./models/experiment.model";

export {
  buildExperiment,
  isStructureVisible,
  setStructureVisibility,
  clearVisibleStructures,
  internProbeInterfaceProbe,
  getInternedProbeInterfaceProbe,
  addProbe,
  removeProbe,
  setProbeInterface,
  setExperimentProperties
} from "./api/experiment.api";
