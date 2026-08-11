<script lang="ts" setup>
import { computed, onUnmounted, ref, toRaw, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  copyProbe,
  findProbeInterfaceProbeByIdentifier,
  getProbeContour,
  getProbeInterfaceDisplayName,
  getProbeInterfaceIdentifier,
  getProbeShankBasePositionMillimeters,
  getProbeShanks,
  homeProbe,
  type Probe,
  setProbeTipMillimeters,
  toggleProbeLock
} from "@/features/probe";
import {
  buildSceneModel,
  STANDARD_COLORS,
  useModelFileImport
} from "@/features/scene";
import { SliceCanvas, useProbeSurface } from "@/features/slice";
import {
  applyCoordinateSystemChainValues,
  type CoordinateSystemNode,
  type CoordinateSystemSolution,
  type CoordinateSystemSolveStatus,
  getCoordinateSystemAxisValue,
  isCoordinateSystemSolutionAtPose,
  PREVIEW_SOLVE_STARTS,
  setCoordinateSystemAxisValue,
  SETTLED_SOLVE_STARTS,
  solveCoordinateSystemChain,
  useInverseKinematicsSolver
} from "@/features/coordinate-system";
import ProbeBodyModelInspector from "./ProbeBodyModelInspector.vue";
import ProbeTransformChain from "./ProbeTransformChain.vue";
import { useProbeLibraryStore } from "@/stores/probe-library.store";
import {
  setProbeCoordinateSystem,
  setProbeInterface
} from "@/features/experiment";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useCoordinateSystemLibraryStore } from "@/stores/coordinate-system-library.store";
import { useValidationRules } from "@/composable/useValidationRules";
import { useNotify } from "@/composable/useNotify";
import CommittedInput from "@/components/CommittedInput.vue";

// A library probe's identifier paired with its display label. `emit-value`
// keeps the model the identifier, which `findProbeInterfaceProbeByIdentifier`
// needs.
interface ProbeTypeOption {
  label: string;
  value: string;
}

// One shank-alignment choice. `null` is the contour-center option; `attrs` puts a
// stable aria-label on the rendered button (Quasar spreads it onto each `q-btn`).
interface ShankAlignmentOption {
  label: string;
  value: number | null;
  attrs: { "aria-label": string };
}

// A library coordinate system's id paired with its name. `emit-value` keeps the
// model the id.
interface CoordinateSystemOption {
  label: string;
  value: string;
}

/** Why a solve or surface check fired, which sets a solve's budget and what it writes. */
type SolveReason = "preview" | "release" | "external";

/** Pose difference, in mm and radians, below which the probe needs no correction. */
const POSE_MATCH_TOLERANCE = 1e-4;

/**
 * Consecutive non-converged preview solves before the unreachable ghost is drawn, so one
 * spurious warm-seed miss during a drag does not flash it.
 */
const SUSTAINED_UNREACHABLE_SOLVES = 3;

/**
 * Consecutive off-surface readings before a preview run warns, so one transient miss during a
 * drag does not flash the warning.
 */
const SUSTAINED_OFF_SURFACE_CHECKS = 3;

const SOLVE_FAILURE_CAPTION_KEYS = {
  stalled: "probeInspector.inverseKinematicsStalled",
  timeout: "probeInspector.inverseKinematicsTimeout",
  noFreeValues: "probeInspector.inverseKinematicsNoFreeValues"
} as const satisfies Record<
  Exclude<CoordinateSystemSolveStatus, "converged" | "diverged">,
  string
>;

const { probe } = defineProps<{
  probe: Probe;
}>();

const probeLibraryStore = useProbeLibraryStore();
const currentExperimentStore = useCurrentExperimentStore();
const coordinateSystemLibraryStore = useCoordinateSystemLibraryStore();
const { requiredName: nameRules } = useValidationRules();

const { t } = useI18n();
const { notifyError, notifyWarning } = useNotify();
const { findTargets, isInsideBrain, isOnSurface } = useProbeSurface();
const { solve: solveInverseKinematics } = useInverseKinematicsSolver();

/** Is the surface sampling pass currently running. */
const isFindingSurface = ref(false);

/**
 * Working copy of the selected coordinate system's chain. Detached from the library so
 * editing a value here never rewrites the shared definition.
 */
const chain = ref<CoordinateSystemNode[]>([]);

/** Indexes into `chain` of `onSurface` nodes whose off-surface reading has been sustained. */
const offSurfaceNodeIndexes = ref<number[]>([]);

/**
 * Aborts the in-flight surface sampling. Deliberately a plain `let`, not a ref:
 * nothing renders it and replacing it must not retrigger effects.
 */
let surfaceAbortController: AbortController | null = null;

/**
 * Consecutive off-surface readings per `chain` index. Deliberately not a ref: nothing renders it
 * and mutating it must not retrigger effects.
 */
const offSurfaceCheckCounts = new Map<number, number>();

/**
 * Guards a surface check against a superseded commit. Deliberately a plain
 * `let`, not a ref: nothing renders it.
 */
let surfaceCheckId = 0;

/** Probe pose this inspector last wrote, so its own correction does not retrigger a solve. */
let appliedPose: {
  tipPosition: [number, number, number];
  rotation: [number, number, number];
} | null = null;

/** Has the unreachable-pose toast fired, so it fires once per excursion out of reach. */
let hasNotifiedNonConvergence = false;

/** Was this probe being dragged, so the next non-drag run is the drag's release solve. */
let wasDragging = false;

/** Is a solve in flight, so a preview never preempts a release or external solve. */
let isSolving = false;

/** Is the preview loop running, so drag frames re-arm it instead of queueing their own solves. */
let isPreviewLoopRunning = false;

/** Did a drag frame land while a preview solve was in flight, so the loop must run again. */
let hasPendingPreview = false;

/** Consecutive non-converged solves since the chain last reached the probe. */
let unreachableSolveCount = 0;

/** Guards a solve against a superseded pose change. */
let solveId = 0;

/**
 * Link to the probe identifier that also repoints its interned interface
 * definition after switching.
 */
const probeIdentifier = computed({
  get: () => probe.probeInterfaceIdentifier,
  set: (value: string) => {
    const probeInterfaceProbe = findProbeInterfaceProbeByIdentifier(
      probeLibraryStore.library,
      value
    );
    if (!probeInterfaceProbe) return;

    setProbeInterface(
      currentExperimentStore.experiment,
      probe,
      probeInterfaceProbe
    );
  }
});

const probeTypeOptions = computed<ProbeTypeOption[]>(() =>
  probeLibraryStore.library.map(probeInterfaceProbe => ({
    label: getProbeInterfaceDisplayName(probeInterfaceProbe),
    value: getProbeInterfaceIdentifier(probeInterfaceProbe)
  }))
);

/**
 * Link to the probe's coordinate system identifier that also interns the picked
 * library definition into the experiment.
 */
const coordinateSystemIdentifier = computed({
  get: () => probe.coordinateSystemIdentifier,
  set: (value: string) => {
    const coordinateSystem = coordinateSystemLibraryStore.library.find(
      ({ id }) => id === value
    );
    if (!coordinateSystem) return;

    setProbeCoordinateSystem(
      currentExperimentStore.experiment,
      probe,
      coordinateSystem
    );
  }
});

/** Coordinate system the transform inputs edit, or null when the experiment has none. */
const selectedCoordinateSystem = computed(
  () =>
    currentExperimentStore.coordinateSystems[
      probe.coordinateSystemIdentifier
    ] ?? null
);

const coordinateSystemOptions = computed<CoordinateSystemOption[]>(() => {
  const options = coordinateSystemLibraryStore.library.map(({ id, name }) => ({
    label: name,
    value: id
  }));
  const selected = selectedCoordinateSystem.value;
  if (selected && !options.some(({ value }) => value === selected.id)) {
    options.push({ label: selected.name, value: selected.id });
  }
  return options;
});

/** Root translation the chain hangs off, in atlas ASR mm, or null for the atlas origin. */
const referenceOffset = computed(() =>
  selectedCoordinateSystem.value?.offsetByReferenceCoordinate
    ? currentExperimentStore.referenceCoordinate
    : null
);

/**
 * The chain's single all-adjustable node, or null when the chain is not exactly
 * invertible from the probe's pose.
 */
const directNode = computed(() => {
  const [node] = chain.value;
  if (chain.value.length !== 1 || !node) return null;
  return [...node.position, ...node.rotation].some(
    ({ mode }) => mode !== "free"
  )
    ? null
    : node;
});

/** Does the working chain have any node constrained to the brain surface. */
const hasSurfaceNode = computed(() => chain.value.some(node => node.onSurface));

/** This probe's interned interface definition, or null when the experiment has none. */
const probeInterfaceProbe = computed(
  () =>
    currentExperimentStore.probeInterfaceProbes[
      probe.probeInterfaceIdentifier
    ] ?? null
);

/** This probe's contour in probe-local mm, or null when its definition has none. */
const contour = computed(() =>
  probeInterfaceProbe.value ? getProbeContour(probeInterfaceProbe.value) : null
);

const shanks = computed(() =>
  probeInterfaceProbe.value && contour.value
    ? getProbeShanks(probeInterfaceProbe.value, contour.value)
    : []
);

// Declared with its derived inputs: an imported model starts at the shank base.
const { isImporting: isImportingBodyModel, open: openBodyModelFile } =
  useModelFileImport(modelId => {
    const model = buildSceneModel(modelId);
    if (contour.value) {
      model.position = getProbeShankBasePositionMillimeters(
        contour.value,
        shanks.value,
        probe.shankAlignmentIndex
      );
    }
    probe.bodyModel = model;
  });

/**
 * One button per shank, left to right, with the center option inserted in the
 * middle. Empty for a single-shank probe, which needs no choice.
 */
const shankAlignmentOptions = computed<ShankAlignmentOption[]>(() => {
  if (shanks.value.length < 2) return [];
  const options = shanks.value.map<ShankAlignmentOption>((_, index) => ({
    label: String(index),
    value: index,
    attrs: { "aria-label": t("probeInspector.alignShank", { index }) }
  }));
  options.splice(Math.ceil(options.length / 2), 0, {
    label: t("probeInspector.alignCenterLabel"),
    value: null,
    attrs: { "aria-label": t("probeInspector.alignCenter") }
  });
  return options;
});

const name = computed({
  get: () => probe.name,
  set: (value: string) => (probe.name = value.trim())
});

const lockIcon = computed(() =>
  probe.lock ? "lock" : "sym_o_lock_open_right"
);

const lockColor = computed(() => (probe.lock ? "accent" : undefined));

const lockLabel = computed(() =>
  probe.lock ? t("probeInspector.unlock") : t("probeInspector.lock")
);

const bodyModelButtonLabel = computed(() =>
  probe.bodyModel
    ? t("probeInspector.replaceBodyModel")
    : t("probeInspector.uploadBodyModel")
);

/**
 * Is a surface move in progress - sampling, or awaiting the user's path pick. A move
 * is incomplete until the tip lands, so this covers both phases.
 */
const isMovingToSurface = computed(
  () =>
    isFindingSurface.value ||
    currentExperimentStore.probeSurfaceChoice?.probeId === probe.id
);

const surfaceIcon = computed(() =>
  isMovingToSurface.value ? "cancel" : "sym_o_place_item"
);

const surfaceLabel = computed(() =>
  isMovingToSurface.value
    ? t("probeInspector.cancelSurface")
    : t("probeInspector.surface")
);

/**
 * Write the probe's live pose into the direct chain's single node.
 * @param node Direct chain node to write, mutated in place.
 */
function writeProbePoseIntoNode(node: CoordinateSystemNode): void {
  const offset = referenceOffset.value ?? [0, 0, 0];
  const [ap, dv, ml] = probe.tipPosition;
  setCoordinateSystemAxisValue(node, "position", 0, ml - offset[2]);
  setCoordinateSystemAxisValue(node, "position", 1, dv - offset[1]);
  setCoordinateSystemAxisValue(node, "position", 2, ap - offset[0]);
  const [roll, yaw, pitch] = probe.rotation;
  setCoordinateSystemAxisValue(node, "rotation", 0, pitch);
  setCoordinateSystemAxisValue(node, "rotation", 1, yaw);
  setCoordinateSystemAxisValue(node, "rotation", 2, roll);
}

/**
 * Solve a direct chain's single node into a probe pose without the matrix chain, so
 * a value reaches the probe exactly as typed.
 * @param node Direct chain node to solve.
 */
function solveDirectNode(node: CoordinateSystemNode): CoordinateSystemSolution {
  const offset = referenceOffset.value ?? [0, 0, 0];
  const tipPosition: [number, number, number] = [
    getCoordinateSystemAxisValue(node, "position", 2) + offset[0],
    getCoordinateSystemAxisValue(node, "position", 1) + offset[1],
    getCoordinateSystemAxisValue(node, "position", 0) + offset[2]
  ];
  return {
    tipPosition,
    rotation: [
      getCoordinateSystemAxisValue(node, "rotation", 2),
      getCoordinateSystemAxisValue(node, "rotation", 1),
      getCoordinateSystemAxisValue(node, "rotation", 0)
    ],
    nodePositions: [tipPosition]
  };
}

/**
 * Mark the chain as reaching the probe: drop this probe's ghost and re-arm the failure toast.
 */
function clearUnreachable(): void {
  hasNotifiedNonConvergence = false;
  unreachableSolveCount = 0;
  if (currentExperimentStore.probeGhost?.probeId === probe.id) {
    currentExperimentStore.probeGhost = null;
  }
}

/** Drop every off-surface warning, its debounce counts, and any in-flight check. */
function clearOffSurfaceWarnings(): void {
  surfaceCheckId++;
  if (offSurfaceNodeIndexes.value.length > 0) offSurfaceNodeIndexes.value = [];
  offSurfaceCheckCounts.clear();
}

/**
 * Solve the working chain's free values onto the probe's pose, driving or clearing the
 * unreachable-pose ghost and toast based on the result.
 * @param reason Why this solve fired, which sets its restart budget and what it writes.
 */
async function runInverseKinematics(reason: SolveReason): Promise<void> {
  if (reason === "preview" && isSolving) return;
  // A settled solve supersedes any drag frame still waiting on the preview loop, so the loop
  // never re-runs a stale preview on top of the release solve's result.
  if (reason !== "preview") hasPendingPreview = false;
  const id = ++solveId;
  isSolving = true;
  try {
    let isTipInsideBrain = false;
    let surfacePosition: [number, number, number] | null = null;
    if (hasSurfaceNode.value) {
      isTipInsideBrain = (await isInsideBrain(probe.tipPosition)) === true;
      if (isTipInsideBrain) {
        surfacePosition = (await findTargets(probe))?.insideMillimeters ?? null;
      }
    }
    if (id !== solveId) return;

    const result = await solveInverseKinematics({
      chain: toRaw(chain.value),
      target: {
        tipPosition: [...probe.tipPosition],
        rotation: [...probe.rotation],
        surfacePosition
      },
      referenceOffsetMillimeters: toRaw(referenceOffset.value),
      maximumStarts:
        reason === "preview" ? PREVIEW_SOLVE_STARTS : SETTLED_SOLVE_STARTS
    });
    if (id !== solveId || !result) return;

    applyCoordinateSystemChainValues(chain.value, result.chain);
    const { solution, status } = result;

    // A drag reports nothing: the ghost drawn at the best-effort pose is the only cue that
    // the target is out of the chain's reach. `diverged` never reports either -- the solve
    // still yields the closest reachable pose, which is what the ghost shows.
    if (
      reason !== "preview" &&
      status !== "converged" &&
      status !== "diverged" &&
      !hasNotifiedNonConvergence
    ) {
      hasNotifiedNonConvergence = true;
      notifyError(
        t("probeInspector.inverseKinematicsFailed"),
        t(SOLVE_FAILURE_CAPTION_KEYS[status])
      );
    }

    if (status === "converged") {
      clearUnreachable();
    } else if (reason === "release") {
      if (
        !isCoordinateSystemSolutionAtPose(
          solution,
          probe.tipPosition,
          probe.rotation,
          POSE_MATCH_TOLERANCE
        )
      ) {
        appliedPose = {
          tipPosition: [...solution.tipPosition],
          rotation: [...solution.rotation]
        };
        setProbeTipMillimeters(probe, solution.tipPosition);
        probe.rotation = [...solution.rotation];
      }
      clearUnreachable();
    } else {
      // A drag can miss one solve and reach the next, so a preview must miss repeatedly before
      // the ghost appears. A one-shot external change has no next iteration to wait for.
      unreachableSolveCount++;
      if (
        reason !== "preview" ||
        unreachableSolveCount >= SUSTAINED_UNREACHABLE_SOLVES
      ) {
        currentExperimentStore.probeGhost = {
          probeId: probe.id,
          tipPosition: [...solution.tipPosition],
          rotation: [...solution.rotation]
        };
      }
    }

    // A preview never writes the probe's pose, so the tip sampled before the solve is still the
    // final tip. A release or external solve can correct the pose, so re-sample it.
    if (reason === "preview") {
      void checkSurfaceNodes(solution, reason, isTipInsideBrain);
    } else {
      void verifySurfaceNodes(solution, reason);
    }
  } finally {
    if (id === solveId) isSolving = false;
  }
}

/**
 * Run one drag frame through the inverse-kinematics preview solve, re-arming
 * itself if another frame lands while this one is still solving.
 */
// The gizmo streams a pose every frame. Instead of a fixed cadence, previews run back to back:
// each iteration reads the probe's live pose, and a frame landing mid-solve just re-arms the loop,
// so the inputs follow the drag as fast as the solver sustains. This cannot livelock -- a preview
// writes only `chain`, `probeGhost`, and `offSurfaceNodeIndexes`, none of which the pose watcher
// below depends on, so nothing but a real drag frame ever sets `hasPendingPreview`.
async function previewInverseKinematics(): Promise<void> {
  if (isPreviewLoopRunning) {
    hasPendingPreview = true;
    return;
  }
  isPreviewLoopRunning = true;
  try {
    do {
      hasPendingPreview = false;
      await runInverseKinematics("preview");
    } while (hasPendingPreview);
  } finally {
    isPreviewLoopRunning = false;
  }
}

/** Re-clone the selected library coordinate system's chain into the working copy. */
function seedChain(): void {
  // A solve still in flight was started for the previous probe or chain: retire its id so its
  // reply is dropped, and clear the flags its own `finally` can no longer reset.
  solveId++;
  isSolving = false;
  hasPendingPreview = false;
  chain.value = selectedCoordinateSystem.value
    ? structuredClone(toRaw(selectedCoordinateSystem.value)).chain
    : [];
  clearOffSurfaceWarnings();
  appliedPose = null;
  clearUnreachable();

  // A single all-adjustable node is exactly invertible from the probe's pose, so
  // the default coordinate system reads and writes live state. Any other chain
  // shape needs a solve to describe the probe's current pose instead of showing
  // the library's stored values.
  const node = directNode.value;
  if (node) {
    writeProbePoseIntoNode(node);
    void verifySurfaceNodes(solveDirectNode(node), "external");
  } else void runInverseKinematics("external");
}

/**
 * Abort an in-flight surface move, dropping any path choice awaiting a pick - which
 * disposes its tubes, since `SceneCanvas`'s draw effect rebuilds from
 * `probeSurfaceChoice` and calls `disposeProbeSurfacePaths` when it is null.
 */
function cancelMoveToSurface(): void {
  surfaceAbortController?.abort();
  surfaceAbortController = null;
  if (currentExperimentStore.probeSurfaceChoice?.probeId === probe.id) {
    currentExperimentStore.probeSurfaceChoice = null;
  }
}

/**
 * Move the probe's tip onto the brain surface, or request a path pick when both an
 * along-axis and a down-on-DV move are available.
 */
async function moveToSurface(): Promise<void> {
  const controller = new AbortController();
  surfaceAbortController = controller;
  isFindingSurface.value = true;
  try {
    const targets = await findTargets(probe, controller.signal);
    // An abort that lands after the rays resolved must still not move the probe. No
    // toast either: the user asked for this to stop, so it is not a failure.
    if (controller.signal.aborted) return;
    if (!targets) {
      notifyWarning(
        t("probeInspector.surfaceUnavailable"),
        t("probeInspector.surfaceUnavailableCaption")
      );
      return;
    }

    const { insideMillimeters, axisMillimeters, dorsoventralMillimeters } =
      targets;
    if (insideMillimeters) {
      setProbeTipMillimeters(probe, insideMillimeters);
      return;
    }
    if (!axisMillimeters && !dorsoventralMillimeters) {
      notifyWarning(
        t("probeInspector.noSurfaceFound"),
        t("probeInspector.noSurfaceFoundCaption")
      );
      return;
    }
    if (!axisMillimeters || !dorsoventralMillimeters) {
      setProbeTipMillimeters(
        probe,
        axisMillimeters ?? dorsoventralMillimeters!
      );
      return;
    }

    currentExperimentStore.probeSurfaceChoice = {
      probeId: probe.id,
      tipPosition: [...probe.tipPosition],
      rotation: [...probe.rotation],
      axisTargetMillimeters: axisMillimeters,
      dorsoventralTargetMillimeters: dorsoventralMillimeters
    };
  } finally {
    isFindingSurface.value = false;
    if (surfaceAbortController === controller) surfaceAbortController = null;
  }
}

/** Start a surface move, or cancel the one already in progress. */
function onSurfaceClick(): void {
  if (isMovingToSurface.value) {
    cancelMoveToSurface();
    return;
  }
  void moveToSurface();
}

/** Re-solve the working chain onto the probe and re-check its on-surface nodes. */
function applySolve(): void {
  const node = directNode.value;
  const solution = node
    ? solveDirectNode(node)
    : solveCoordinateSystemChain(chain.value, referenceOffset.value);
  appliedPose = {
    tipPosition: [...solution.tipPosition],
    rotation: [...solution.rotation]
  };
  setProbeTipMillimeters(probe, solution.tipPosition);
  probe.rotation = [...solution.rotation];
  clearUnreachable();
  void verifySurfaceNodes(solution, "external");
}

/**
 * Sample whether the probe's committed tip is inside the brain, then check the chain's
 * on-surface nodes against it.
 * @param solution Solved chain the node positions come from.
 * @param reason Why the change that produced this check fired.
 */
async function verifySurfaceNodes(
  solution: CoordinateSystemSolution,
  reason: SolveReason
): Promise<void> {
  if (!hasSurfaceNode.value) {
    clearOffSurfaceWarnings();
    return;
  }
  const checkId = ++surfaceCheckId;
  const isTipInsideBrain = (await isInsideBrain(probe.tipPosition)) === true;
  if (checkId !== surfaceCheckId) return;
  void checkSurfaceNodes(solution, reason, isTipInsideBrain);
}

/**
 * Replace the off-surface warnings with the on-surface nodes the atlas rejects, once a preview's
 * rejection has held for `SUSTAINED_OFF_SURFACE_CHECKS` consecutive checks.
 * @param solution Solved chain the node positions come from.
 * @param reason Why the solve that produced this check fired.
 * @param isTipInsideBrain Was the probe's tip inside the brain for this solve.
 */
async function checkSurfaceNodes(
  solution: CoordinateSystemSolution,
  reason: SolveReason,
  isTipInsideBrain: boolean
): Promise<void> {
  const indexes = chain.value.flatMap((node, index) =>
    node.onSurface ? [index] : []
  );
  // Outside the brain the solver never got a surface goal, so there is nothing to verify.
  if (!isTipInsideBrain || indexes.length === 0) {
    clearOffSurfaceWarnings();
    return;
  }

  const checkId = ++surfaceCheckId;
  const results = await Promise.all(
    indexes.map(index => isOnSurface(solution.nodePositions[index]!))
  );
  if (checkId !== surfaceCheckId) return;

  const warned: number[] = [];
  indexes.forEach((index, position) => {
    if (results[position] !== false) {
      offSurfaceCheckCounts.delete(index);
      return;
    }
    // A one-shot solve has no next check to wait for, so it warns at once and holds the warning
    // through the previews of any later drag.
    const next = (offSurfaceCheckCounts.get(index) ?? 0) + 1;
    const count =
      reason === "preview"
        ? next
        : Math.max(next, SUSTAINED_OFF_SURFACE_CHECKS);
    offSurfaceCheckCounts.set(index, count);
    if (count >= SUSTAINED_OFF_SURFACE_CHECKS) warned.push(index);
  });
  offSurfaceNodeIndexes.value = warned;
}

// A different probe or a different coordinate system starts from the library's values.
watch([() => probe.id, () => probe.coordinateSystemIdentifier], seedChain, {
  immediate: true
});

// The scene writes the probe's pose straight into state on every gizmo drag frame. A direct
// chain mirrors it live and needs no solve. Any other chain solves for it: at 10 Hz while
// dragging, once more when `endProbeDrag` nulls `draggedProbeId` (the release run), and once
// for an external change such as undo, Home, or Move to surface. Nothing is committed to
// history until that release run.
watch(
  [
    () => probe.tipPosition,
    () => probe.rotation,
    referenceOffset,
    () => currentExperimentStore.draggedProbeId
  ],
  () => {
    const node = directNode.value;
    if (node) {
      writeProbePoseIntoNode(node);
      clearUnreachable();
      void verifySurfaceNodes(
        solveDirectNode(node),
        currentExperimentStore.draggedProbeId === probe.id
          ? "preview"
          : "external"
      );
      return;
    }
    if (
      appliedPose &&
      appliedPose.tipPosition.every(
        (value, index) => value === probe.tipPosition[index]
      ) &&
      appliedPose.rotation.every(
        (value, index) => value === probe.rotation[index]
      )
    ) {
      appliedPose = null;
      return;
    }
    if (currentExperimentStore.draggedProbeId === probe.id) {
      wasDragging = true;
      void previewInverseKinematics();
      return;
    }
    if (wasDragging) {
      wasDragging = false;
      void runInverseKinematics("release");
      return;
    }
    void runInverseKinematics("external");
  },
  { deep: true }
);

onUnmounted(() => {
  cancelMoveToSurface();
  clearUnreachable();
});
</script>

<template>
  <q-list class="probe-inspector">
    <q-expansion-item
      default-opened
      header-class="text-weight-bold"
      icon="sym_o_transition_chop"
      :label="t('probeInspector.inPlaneSlice')"
    >
      <div class="q-py-md">
        <div class="column no-wrap q-gutter-y-md">
          <SliceCanvas :probe="probe" />
        </div>
      </div>
    </q-expansion-item>
    <q-separator />
    <q-expansion-item
      default-opened
      header-class="text-weight-bold"
      icon="sym_o_page_info"
      :label="t('probeInspector.properties')"
    >
      <div class="q-py-md">
        <div class="column no-wrap q-gutter-y-md">
          <div>
            <q-btn-group spread>
              <q-btn
                :aria-label="t('probeInspector.home')"
                :disable="probe.lock"
                icon="home"
                @click="
                  homeProbe(probe, currentExperimentStore.referenceCoordinate)
                "
              >
                <q-tooltip>{{ t("probeInspector.home") }}</q-tooltip>
              </q-btn>
              <q-btn
                :aria-label="surfaceLabel"
                :disable="probe.lock && !isMovingToSurface"
                :icon="surfaceIcon"
                @click="onSurfaceClick"
              >
                <q-tooltip>{{ surfaceLabel }}</q-tooltip>
              </q-btn>
              <q-btn
                :aria-label="t('probeInspector.copy')"
                icon="content_copy"
                @click="copyProbe(currentExperimentStore.experiment, probe)"
              >
                <q-tooltip>{{ t("probeInspector.copy") }}</q-tooltip>
              </q-btn>
              <q-btn
                :aria-label="lockLabel"
                :icon="lockIcon"
                @click="toggleProbeLock(probe)"
                :color="lockColor"
              >
                <q-tooltip>{{ t("probeInspector.lock") }}</q-tooltip>
              </q-btn>
            </q-btn-group>

            <q-linear-progress
              v-if="isMovingToSurface"
              indeterminate
              color="primary"
              size="sm"
            />
          </div>

          <CommittedInput
            v-model="name"
            :label="t('probeInspector.name')"
            hide-bottom-space
            outlined
            :rules="nameRules"
          />

          <q-select
            v-model="probeIdentifier"
            emit-value
            :label="t('probeInspector.probeType')"
            map-options
            :options="probeTypeOptions"
            outlined
          />

          <div v-if="shankAlignmentOptions.length">
            <div class="text-body2 q-pb-xs">{{
              t("probeInspector.centeredShankIndex")
            }}</div>
            <q-btn-toggle
              v-model="probe.shankAlignmentIndex"
              :aria-label="t('probeInspector.shankAlignment')"
              :disable="probe.lock"
              :options="shankAlignmentOptions"
              spread
              toggle-color="primary"
            />
          </div>

          <q-select
            v-model="coordinateSystemIdentifier"
            emit-value
            :label="t('probeInspector.coordinateSystem')"
            map-options
            :options="coordinateSystemOptions"
            outlined
          />

          <ProbeTransformChain
            :chain="chain"
            :disable="probe.lock"
            :off-surface-node-indexes="offSurfaceNodeIndexes"
            @commit="applySolve"
          />

          <div>
            <q-color
              v-model="probe.color"
              :palette="STANDARD_COLORS"
              default-view="palette"
            />
          </div>
        </div>
      </div>
    </q-expansion-item>
    <q-separator />
    <q-expansion-item
      default-opened
      header-class="text-weight-bold"
      icon="sym_o_deployed_code"
      :label="t('probeInspector.bodyModel')"
    >
      <div class="q-py-md">
        <div class="column no-wrap q-gutter-y-md">
          <q-btn
            :aria-label="bodyModelButtonLabel"
            class="full-width"
            icon="sym_o_upload_file"
            :label="bodyModelButtonLabel"
            :loading="isImportingBodyModel"
            @click="openBodyModelFile"
          />
          <template v-if="probe.bodyModel">
            <ProbeBodyModelInspector
              :body-model="probe.bodyModel"
              :disable="probe.lock"
              :probe-id="probe.id"
            />
            <q-btn
              :aria-label="t('probeInspector.removeBodyModel')"
              class="full-width"
              color="negative"
              icon="delete"
              :label="t('probeInspector.removeBodyModel')"
              @click="probe.bodyModel = null"
            />
          </template>
        </div>
      </div>
    </q-expansion-item>
  </q-list>
</template>

<style lang="sass" scoped>
// Without this, the long probe-type label's intrinsic content width forces
// this flex item to grow past its drawer's width instead of wrapping/eliding.
.probe-inspector
  width: 100%

  :deep(.q-select)
    width: 100%
    min-width: 0

  :deep(.q-field__native > span)
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap
</style>
