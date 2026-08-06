export { default as NewExperimentDialog } from "./components/NewExperimentDialog.vue";
export { default as RecentExperimentsDialog } from "./components/RecentExperimentsDialog.vue";
export { default as RecentExperimentsList } from "./components/RecentExperimentsList.vue";
export { default as ExperimentPropertiesDialog } from "./components/ExperimentPropertiesDialog.vue";
export { useExperimentFile } from "./composable/useExperimentFile";
export type { Experiment } from "./models/experiment.model";
export type { CameraPose } from "./models/camera-pose.model";
export { buildCameraPose, isCameraPose } from "./api/camera-pose.api";
export { ALLEN_MOUSE_REFERENCE_COORDINATE } from "./api/reference-coordinate.api";

export {
  buildExperiment,
  cloneExperiment,
  isStructureVisible,
  setStructureVisibility,
  clearVisibleStructures,
  internProbeInterfaceProbe,
  getInternedProbeInterfaceProbe,
  addProbe,
  removeProbe,
  reorderProbe,
  setProbeInterface,
  setExperimentProperties,
  addCameraPose,
  removeCameraPose,
  reorderCameraPose
} from "./api/experiment.api";
