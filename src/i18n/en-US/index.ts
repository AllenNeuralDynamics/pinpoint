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
    removeFavorite: "Remove from favorites",
    openSource: "Open the atlas's source"
  },
  atlasHierarchy: {
    search: "Search",
    enabledOnly: "Enabled only",
    clear: "Clear",
    regionMeshUnavailable: "Could not load region mesh",
    regionMeshUnavailableCaption: "Check your connection to the atlas source.",
    regionCenterUnavailable: "No center in this hemisphere",
    regionCenterUnavailableCaption:
      "{name} has no geometry on that side of the midline."
  },
  currentExperiment: {
    defaultName: "My First Experiment"
  },
  validation: {
    nameRequired: "Name is required.",
    mustBeNumber: "Must be a number.",
    mustBePositiveNumber: "Must be greater than zero."
  },
  axis: {
    ap: "AP",
    dv: "DV",
    ml: "ML",
    x: "X",
    y: "Y",
    z: "Z"
  },
  newExperiment: {
    title: "New Experiment",
    experimentName: "Experiment name",
    cancel: "Cancel",
    create: "Create",
    pickNameAndAtlas: "Pick an experiment name and atlas"
  },
  experimentProperties: {
    title: "Experiment Properties",
    experimentName: "Experiment name",
    referenceCoordinate: "Reference Coordinate",
    cancel: "Cancel",
    save: "Save",
    incomplete: "Enter a name, pick an atlas, and set the reference coordinate."
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
    atlasLikelyNotSupportedYet: "It's likely not fully supported yet.",
    problemLoadingAxisGuides:
      "There was a problem loading the axis guide labels.",
    axisGuidesUnavailable: "The atlas axis labels won't be shown.",
    entityCollision: "{first} can collide with {second}.",
    entityCollisionCaption:
      "Move one of them so their bodies no longer overlap.",
    sceneObjectUnavailable: "Unable to load a 3D object's model.",
    sceneObjectUnavailableCaption:
      "Its model file is missing from this browser's storage.",
    sceneObjectColliderUnavailable:
      "A 3D object's model couldn't be turned into a collision shape.",
    sceneObjectColliderUnavailableCaption:
      "It won't collide with probes or other 3D objects.",
    probeBodyModelUnavailable: "Unable to load a probe's body model.",
    probeBodyModelUnavailableCaption:
      "Its model file is missing from this browser's storage.",
    probeBodyModelColliderUnavailable:
      "A probe's body model couldn't be turned into a collision shape.",
    probeBodyModelColliderUnavailableCaption:
      "It won't collide with other probes or 3D objects.",
    gizmoMode: "Transform mode",
    gizmoPosition: "Position",
    gizmoRotation: "Rotation",
    gizmoScale: "Scale",
    gizmoCoordinateSpace: "Coordinate space",
    gizmoLocal: "Local",
    gizmoGlobal: "Global"
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
      "Check that the file is a Pinpoint experiment zip file containing experiment.json.",
    downloadFailed: "Unable to download experiment.",
    downloadFailedCaption:
      "Check your browser's download settings and try again.",
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
    undo: "Undo",
    redo: "Redo",
    ctrlKey: "Ctrl",
    shiftKey: "Shift",
    experimentProperties: "Experiment Properties",
    probeLibrary: "Probe Library",
    preferences: "Preferences",
    view: "View",
    splashScreen: "Splash Screen",
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
  modelFile: {
    invalidModelFile: "Unable to import that 3D model.",
    invalidModelFileCaption:
      "Check that the file is a glTF, GLB, OBJ, STL, FBX, or Babylon model with at least one mesh."
  },
  sceneHierarchy: {
    probes: "Probes",
    scene: "Scene",
    addProbe: "Add Probe",
    manageProbes: "Manage probes...",
    camera: "Camera",
    axisGuides: "Axis Guides",
    showAxisGuides: "Show axis guides",
    hideAxisGuides: "Hide axis guides",
    dragToReorder: "Drag to reorder",
    addSceneObject: "Add 3D Object",
    removeSceneObject: "Remove 3D object",
    showSceneObject: "Show 3D object",
    hideSceneObject: "Hide 3D object"
  },
  inspector: {
    emptyHint: "Pick something from the scene to inspect."
  },
  probeInspector: {
    name: "Name",
    probeType: "Probe Type",
    roll: "Roll",
    yaw: "Yaw",
    pitch: "Pitch",
    home: "Reset tip position",
    surface: "Move to surface",
    cancelSurface: "Cancel move to surface",
    noSurfaceFound: "No brain surface found",
    noSurfaceFoundCaption:
      "Neither the probe's axis nor straight down on DV reaches the atlas.",
    surfaceUnavailable: "Could not read the atlas annotations",
    surfaceUnavailableCaption: "Check your connection to the atlas source.",
    copy: "Duplicate probe",
    lock: "Lock probe",
    unlock: "Unlock probe",
    centeredShankIndex: "Centered Shank Index",
    shankAlignment: "Probe alignment",
    alignShank: "Align to shank {index}",
    alignCenter: "Align to probe center",
    alignCenterLabel: "C",
    inPlaneSlice: "In-plane Slice",
    properties: "Properties",
    bodyModel: "Body Model",
    uploadBodyModel: "Upload body 3D model",
    replaceBodyModel: "Replace body 3D model",
    removeBodyModel: "Remove body 3D model",
    attachBodyModelGizmo: "Attach gizmo",
    detachBodyModelGizmo: "Detach gizmo",
    bodyModelPosition: "Position {axis}",
    bodyModelRotation: "Rotation {axis}",
    bodyModelScale: "Scale {axis}",
    scaleSuffix: "×"
  },

  sceneObjectInspector: {
    name: "Name",
    roll: "Roll",
    yaw: "Yaw",
    pitch: "Pitch",
    scaleSuffix: "×",
    lock: "Lock 3D object",
    unlock: "Unlock 3D object",
    collisionDetection: "Collision detection"
  },
  cameraInspector: {
    poseName: "Pose name",
    defaultPoseName: "Pose",
    alpha: "Alpha",
    beta: "Beta",
    radius: "Radius",
    orbit: "Orbit",
    target: "Target",
    poses: "Saved Poses",
    projection: "Projection",
    perspective: "Perspective",
    orthographic: "Orthographic",
    savePose: "Save Pose",
    applyPose: "Move camera to {name}",
    deletePose: "Delete pose",
    dragToReorder: "Drag to reorder",
    noPoses: "No saved camera poses yet."
  },
  slice: {
    zoom: "Zoom",
    center: "Center along probe",
    noContour: "This probe has no contour to slice through.",
    channelMap: "In-plane slice for {name}",
    channelMapWindow: "Channel map window for {name}",
    millimeters: "{value} mm",
    zoomSmall: "Small",
    zoomMedium: "Medium",
    zoomLarge: "Large"
  },
  errorNotFound: {
    code: "404",
    message: "Oops. Nothing here...",
    goHome: "Go Home"
  },
  units: {
    centimeter: "cm",
    millimeter: "mm",
    micrometer: "µm",
    degree: "°",
    radian: "rad"
  },
  preferences: {
    title: "Preferences",
    general: "General",
    scene: "Scene",
    probe: "Probe",
    export: "Export",
    reset: "Reset",
    close: "Close",
    done: "Done",

    camera: "Camera",
    projection: "Projection",
    perspective: "Perspective",
    orthographic: "Orthographic",
    inertia: "Inertia",
    inertiaSnappy: "Snappy",
    inertiaSmooth: "Smooth",

    world: "World",
    openEditor: "Open Editor",
    backgroundColor: "Background Color",
    lightPower: "Light Power",
    specularIntensity: "Specular Intensity",
    specularPower: "Glossiness",
    hideStructureInteriors: "Hide Interior Surfaces",
    ambientOcclusion: "Ambient Occlusion",

    appearanceTitle: "Appearance",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeAuto: "Auto",

    startupTitle: "Startup",
    skipSplashScreen: "Skip Splash Screen",

    unitsTitle: "Units",
    positionUnit: "Position",
    rotationUnit: "Rotation",
    decimalPrecision: "Decimal Places",

    probeShape: "Probe Shape",
    shankThickness: "Shank Thickness",
    headStageLength: "Headstage Length",
    headStageCutDepth: "Headstage Cut Depth",
    rodDiameter: "Rod Diameter",
    rodLength: "Rod Length",

    exportHint:
      "Download your preferences as a JSON file, or upload one to replace them with its values.",
    downloadPreferences: "Download Preferences",
    uploadPreferences: "Upload Preferences",
    downloadFailed: "Unable to download preferences.",
    downloadFailedCaption:
      "Check your browser's download settings and try again.",
    invalidPreferencesFile: "Unable to read preferences file.",
    invalidPreferencesFileCaption:
      "Check that the file is a Pinpoint preferences JSON file and that every value is in range.",
    preferencesImported: "Preferences replaced.",
    preferencesImportedCaption:
      "Every preference now matches the uploaded file.",
    versionMajorBehind:
      "These preferences are a major version behind Pinpoint.",
    versionMajorBehindCaption:
      "Saved by Pinpoint {fileVersion}; this is {appVersion}. Applied every value anyway and stamped these preferences as {appVersion} - some may no longer mean the same thing.",
    versionMinorBehind:
      "These preferences are a minor version behind Pinpoint.",
    versionMinorBehindCaption:
      "Saved by Pinpoint {fileVersion}; this is {appVersion}. Applied every value anyway and stamped these preferences as {appVersion}.",
    versionMajorAhead:
      "These preferences are from a newer major version of Pinpoint.",
    versionMajorAheadCaption:
      "Saved by Pinpoint {fileVersion}; this is {appVersion}. Applied every value anyway and stamped these preferences as {appVersion} - some may not be supported.",
    versionMinorAhead:
      "These preferences are from a newer version of Pinpoint.",
    versionMinorAheadCaption:
      "Saved by Pinpoint {fileVersion}; this is {appVersion}. Applied every value anyway and stamped these preferences as {appVersion}.",
    versionUnknown: "Unable to determine these preferences' Pinpoint version.",
    versionUnknownCaption:
      "Applied every value anyway and stamped these preferences as {appVersion}, but compatibility with this Pinpoint version is unknown.",
    resetHint:
      "Clearing a store deletes its saved data from this browser and reloads Pinpoint.",
    clear: "Clear saved data",
    resetAll: "Reset Everything",
    confirmClearTitle: "Clear saved data?",
    confirmClear:
      'This deletes the saved "{name}" data from this browser and then reloads Pinpoint so the store starts from its defaults. The deletion is permanent - the data cannot be recovered.',
    confirmResetAllTitle: "Reset everything?",
    confirmResetAll:
      "This deletes all saved Pinpoint data from this browser - experiments, recents, probe library, favorite atlases, and preferences - and then reloads Pinpoint so every store starts from its defaults. The deletion is permanent - the data cannot be recovered.",
    confirmOk: "Clear",
    storeCurrentExperiment: "Current Experiment",
    storeRecentExperiments: "Recent Experiments",
    storeProbeLibrary: "Probe Library",
    storeFavoriteAtlases: "Favorite Atlases",
    storePreferences: "Preferences"
  }
};
