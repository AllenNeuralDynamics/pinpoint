export default {
  atlasPicker: {
    title: "Atlas",
    brainglobeHosted: "BrainGlobe Hosted",
    customHTTPHost: "Custom HTTP Host",
    sourceUrl: "Source URL",
    search: "Search",
    atlasCount: "no atlases | one atlas | {count} atlases",
    noAtlases: "No atlases found.",
    noAtlasesCaption: "Check your connection to the source.",
    addFavorite: "Add to favorites",
    removeFavorite: "Remove from favorites"
  },
  atlasHierarchy: {
    search: "Search",
    clear: "Clear"
  },
  currentExperiment: {
    defaultName: "My First Experiment"
  },
  newExperiment: {
    title: "New Experiment",
    experimentName: "Experiment name",
    cancel: "Cancel",
    create: "Create",
    pickNameAndAtlas: "Pick an experiment name and atlas",
    failedToFetchAtlas: "Failed to fetch atlas.",
    checkAtlas:
      "Please check your connection to the source and the atlas's existence."
  },
  recentExperiments: {
    title: "Recent Experiments",
    noRecents: "No recent experiments.",
    deleteExperiment: "Delete Experiment",
    confirmDelete: 'Are you sure you wish to delete "{name}"?',
    delete: "Delete",
    close: "Close"
  },
  splash: {
    title: "Pinpoint V",
    new: "New",
    resume: "Resume",
    open: "Open",
    userGuide: "User Guide",
    vblWebsite: "VBL Website"
  },
  sceneCanvas: {
    problemLoadingAtlasMeshes:
      "There was a problem loading the meshes for this atlas.",
    atlasLikelyNotSupportedYet: "It's likely not fully supported yet."
  },
  installProbe: {
    title: "Install Probe",
    manufacturer: "Manufacturer",
    search: "Search",
    cancel: "Cancel",
    uploadCustom: "Upload Custom Probe",
    install: "Install",
    selectProbeHint: "Select a probe to add!",
    installFailed: "Unable to install probe.",
    installFailedCaption: "Check your connection and try again.",
    invalidProbeFile: "Unable to read probe file.",
    invalidProbeFileCaption:
      "Check that the file is a valid ProbeInterface JSON file."
  },
  experimentFile: {
    invalidExperimentFile: "Unable to read experiment file.",
    invalidExperimentFileCaption:
      "Check that the file is a Pinpoint experiment JSON file.",
    downloadFailed: "Unable to download experiment.",
    downloadFailedCaption:
      "Check your browser's download settings and try again.",
    atlasUnavailable: "Loaded the experiment, but its atlas is unavailable.",
    atlasUnavailableCaption:
      "Check your connection to the atlas source. Probes are shown without the brain.",
    versionMajorBehind: "This experiment is a major version behind Pinpoint.",
    versionMajorBehindCaption:
      "Saved by Pinpoint {fileVersion}; this is {appVersion}. It may not work at all. You can upgrade the version in the experiment settings dialog.",
    versionMinorBehind: "This experiment is a minor version behind Pinpoint.",
    versionMinorBehindCaption:
      "Saved by Pinpoint {fileVersion}; this is {appVersion}. Some features may not work. You can upgrade the version in the experiment settings dialog.",
    versionMajorAhead:
      "This experiment is from a newer major version of Pinpoint.",
    versionMajorAheadCaption:
      "Saved by Pinpoint {fileVersion}; this is {appVersion}. Pinpoint may not be able to operate on this file at all.",
    versionMinorAhead: "This experiment is from a newer version of Pinpoint.",
    versionMinorAheadCaption:
      "Saved by Pinpoint {fileVersion}; this is {appVersion}. Pinpoint may not have some features used in this experiment.",
    versionUnknown: "Unable to determine this experiment's Pinpoint version.",
    versionUnknownCaption:
      "Opened it anyway, but compatibility with this Pinpoint version is unknown."
  },
  layout: {
    file: "File",
    new: "New",
    open: "Open",
    openRecent: "Open Recent",
    download: "Download",
    edit: "Edit",
    preferences: "Preferences",
    probeLibrary: "Probe Library",
    view: "View",
    splashScreen: "Splash Screen",
    toggleDarkMode: "Toggle Dark Mode",
    scene: "Scene",
    channelMaps: "Channel Maps",
    atlas: "Atlas",
    help: "Help"
  },
  probeLibrary: {
    title: "Probe Library",
    installProbe: "Install Probe",
    dragToReorder: "Drag to reorder",
    close: "Close"
  },
  sceneHierarchy: {
    addProbe: "Add Probe",
    manageProbes: "Manage probes..."
  },
  inspector: {
    emptyHint: "Pick something from the scene to inspect."
  },
  probeInspector: {
    name: "Name",
    probeType: "Probe Type",
    ap: "AP",
    dv: "DV",
    ml: "ML",
    roll: "Roll",
    yaw: "Yaw",
    pitch: "Pitch",
    nameRequired: "Name is required.",
    mustBeNumber: "Must be a number."
  },
  slice: {
    zoom: "Zoom",
    center: "Center along probe",
    extent: "{extent} mm",
    noContour: "This probe has no contour to slice through."
  },
  errorNotFound: {
    code: "404",
    message: "Oops. Nothing here...",
    goHome: "Go Home"
  }
};
