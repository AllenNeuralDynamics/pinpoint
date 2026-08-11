import { markRaw, toRaw } from "vue";
import type { Probe, ProbeChannelMapWindow } from "../models/probe.model";
import type { ProbeSurfaceChoice } from "../models/probe-surface-choice.model";
import type { ProbeVisibility } from "../models/visibility.model";
import type { ProbeInterfaceProbe } from "../models/probe-interface.model";
import type { Experiment } from "@/features/experiment";
import type { CoordinateSystem } from "@/features/coordinate-system";
import { getCoordinateSystemIdentifier } from "@/features/coordinate-system";
import {
  KNOWN_MANUFACTURERS,
  KNOWN_PROBES
} from "../models/known-probes.model";
import { isSceneModel, STANDARD_COLORS } from "@/features/scene";
import {
  isFiniteTriple,
  isFiniteNumber,
  isHexColor,
  isRecord
} from "@/utils/type-guards";

/** Every valid probe visibility, for validating untrusted probe data. */
const PROBE_VISIBILITIES: readonly string[] = [
  "visible",
  "shanks",
  "hidden"
] satisfies readonly ProbeVisibility[];

/** Appended to a copied probe's name. */
const PROBE_COPY_NAME_SUFFIX = " - copy";

/** Next visibility in the visible -> shanks -> hidden -> visible cycle. */
const NEXT_PROBE_VISIBILITY: Record<ProbeVisibility, ProbeVisibility> = {
  visible: "shanks",
  shanks: "hidden",
  hidden: "visible"
};

/**
 * Build a probe referencing the given probe interface definition, with a
 * random name and color, the given tip position, and a pitch pointing inferiorly.
 * @param probeInterfaceProbe Probe interface definition for the probe.
 * @param tipPosition Starting tip position, in atlas ASR mm.
 * @param coordinateSystem Coordinate system the probe's pose is entered in.
 */
export function buildProbe(
  probeInterfaceProbe: ProbeInterfaceProbe,
  tipPosition: [number, number, number],
  coordinateSystem: CoordinateSystem
): Probe {
  const uuid = crypto.randomUUID();
  const uniqueName = uuid.slice(0, 8);
  return {
    inspectableKind: "probe",
    id: uuid,
    name: `Probe ${uniqueName}`,
    color: STANDARD_COLORS[Math.floor(Math.random() * STANDARD_COLORS.length)]!,
    visibility: "visible",
    lock: false,
    probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe),
    coordinateSystemIdentifier: getCoordinateSystemIdentifier(coordinateSystem),
    tipPosition: [...tipPosition],
    rotation: [0, 0, Math.PI / 2],
    sliceExtentMillimeters: null,
    sliceCenterHeightMillimeters: 0,
    channelMapWindow: null,
    shankAlignmentIndex: null,
    bodyModel: null
  };
}

/**
 * Detach a probe interface definition from Vue's reactivity, so it can be
 * interned into experiment state without being deep-watched.
 * @param probeInterfaceProbe Probe interface definition to detach.
 */
export function detachProbeInterfaceProbe(
  probeInterfaceProbe: ProbeInterfaceProbe
): ProbeInterfaceProbe {
  return markRaw(structuredClone(toRaw(probeInterfaceProbe)));
}

/**
 * Detach every probe interface definition in a record from Vue's reactivity,
 * in place.
 * @param probeInterfaceProbes Record of probe interface definitions to detach.
 */
export function detachProbeInterfaceProbes(
  probeInterfaceProbes: Record<string, ProbeInterfaceProbe>
) {
  for (const [identifier, definition] of Object.entries(probeInterfaceProbes)) {
    probeInterfaceProbes[identifier] = detachProbeInterfaceProbe(definition);
  }
}

/**
 * Toggle a probe's visibility through visible -> shanks -> hidden -> visible.
 * @param probe Probe to change the visibility of.
 */
export function rotateProbeVisibility(probe: Probe) {
  probe.visibility = NEXT_PROBE_VISIBILITY[probe.visibility];
}

/**
 * Reset a probe's tip position to the experiment's reference coordinate.
 * @param probe Probe to reset the tip position of.
 * @param referenceCoordinate Experiment reference coordinate, in atlas ASR mm.
 */
export function homeProbe(
  probe: Probe,
  referenceCoordinate: [number, number, number]
) {
  probe.tipPosition = [...referenceCoordinate];
}

/**
 * Move a probe's tip to a point in atlas ASR millimeters.
 * @param probe Probe to move.
 * @param atlasMillimeters Target tip position, in atlas ASR mm.
 */
export function setProbeTipMillimeters(
  probe: Probe,
  atlasMillimeters: [number, number, number]
): void {
  probe.tipPosition = [...atlasMillimeters];
}

/**
 * Is a pending surface choice still valid, i.e. has its probe not been moved since.
 * @param choice Choice to validate.
 * @param probe Probe the choice was requested for.
 */
export function isProbeSurfaceChoiceCurrent(
  choice: ProbeSurfaceChoice,
  probe: Probe
): boolean {
  return (
    choice.tipPosition[0] === probe.tipPosition[0] &&
    choice.tipPosition[1] === probe.tipPosition[1] &&
    choice.tipPosition[2] === probe.tipPosition[2] &&
    choice.rotation[0] === probe.rotation[0] &&
    choice.rotation[1] === probe.rotation[1] &&
    choice.rotation[2] === probe.rotation[2]
  );
}

/**
 * Duplicate a probe's entry in the experiment with a fresh id and a
 * copy-suffixed name, returning the copy or null when the probe isn't there.
 * @param experiment Experiment holding the probe entry to duplicate.
 * @param probe Probe to duplicate.
 */
export function copyProbe(experiment: Experiment, probe: Probe): Probe | null {
  const index = experiment.probes.findIndex(({ id }) => id === probe.id);
  if (index === -1) return null;

  const copy = structuredClone(toRaw(experiment.probes[index]!));
  copy.id = crypto.randomUUID();
  copy.name = `${copy.name}${PROBE_COPY_NAME_SUFFIX}`;
  experiment.probes.splice(index + 1, 0, copy);

  return copy;
}

/**
 * Toggle whether a probe is locked against pose edits.
 * @param probe Probe to toggle the lock of.
 */
export function toggleProbeLock(probe: Probe) {
  probe.lock = !probe.lock;
}

/**
 * Return the probe's manufacturer and model name as a single identifier string.
 * @param probeInterfaceProbe Probe interface definition to extract identifier from.
 */
export function getProbeInterfaceIdentifier(
  probeInterfaceProbe: ProbeInterfaceProbe
): string {
  return `${String(probeInterfaceProbe.annotations!.manufacturer)} ${String(probeInterfaceProbe.annotations!.model_name)}`;
}

/**
 * Find a probe interface definition in a library by its identifier, or null
 * if none match.
 * @param library Probe interface definitions to search.
 * @param identifier Identifier to match, as produced by {@link getProbeInterfaceIdentifier}.
 */
export function findProbeInterfaceProbeByIdentifier(
  library: ProbeInterfaceProbe[],
  identifier: string
): ProbeInterfaceProbe | null {
  return (
    library.find(
      probeInterfaceProbe =>
        getProbeInterfaceIdentifier(probeInterfaceProbe) === identifier
    ) ?? null
  );
}

/**
 * Return a probe's human-readable manufacturer and model name for display,
 * e.g. `IMEC Neuropixels 1.0 probe (NP1000)`.
 * @param probeInterfaceProbe Probe interface definition to describe.
 */
export function getProbeInterfaceDisplayName(
  probeInterfaceProbe: ProbeInterfaceProbe
): string {
  const manufacturerName = String(
    probeInterfaceProbe.annotations!.manufacturer
  );
  const modelName = String(probeInterfaceProbe.annotations!.model_name);

  return `${getManufacturerDisplayName(manufacturerName)} ${getProbeModelDisplayName(manufacturerName, modelName)}`;
}

/**
 * Return a manufacturer's proper noun for display, falling back to the raw
 * manufacturer name when unknown.
 * @param manufacturerName Manufacturer name, e.g. `cambridgeneurotech`.
 */
export function getManufacturerDisplayName(manufacturerName: string): string {
  return KNOWN_MANUFACTURERS[manufacturerName] ?? manufacturerName;
}

/**
 * Return a probe model's human-readable description for display, falling
 * back to the raw model name when unknown.
 * @param manufacturerName Manufacturer the model belongs to.
 * @param modelName Probe model name, e.g. `NP1000`.
 */
export function getProbeModelDisplayName(
  manufacturerName: string,
  modelName: string
): string {
  return KNOWN_PROBES[`${manufacturerName} ${modelName}`]?.trim() ?? modelName;
}

/**
 * Check that a value has the minimal shape of a ProbeInterface probe,
 * including the annotations `getProbeInterfaceIdentifier` assumes are present.
 * @param value Value to check.
 */
export function isProbeInterfaceProbe(
  value: unknown
): value is ProbeInterfaceProbe {
  if (!isRecord(value)) return false;

  if (
    typeof value.ndim !== "number" ||
    typeof value.si_units !== "string" ||
    !Array.isArray(value.contact_positions)
  ) {
    return false;
  }

  if (!isRecord(value.annotations)) return false;

  return (
    typeof value.annotations.model_name === "string" &&
    typeof value.annotations.manufacturer === "string"
  );
}

/**
 * Check that a value has the shape of a `Probe`.
 * @param value Value to check.
 */
export function isProbe(value: unknown): value is Probe {
  if (!isRecord(value)) return false;

  return (
    value.inspectableKind === "probe" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    isHexColor(value.color) &&
    typeof value.visibility === "string" &&
    PROBE_VISIBILITIES.includes(value.visibility) &&
    typeof value.lock === "boolean" &&
    typeof value.probeInterfaceIdentifier === "string" &&
    typeof value.coordinateSystemIdentifier === "string" &&
    isFiniteTriple(value.tipPosition) &&
    isFiniteTriple(value.rotation) &&
    (value.sliceExtentMillimeters === null ||
      isFiniteNumber(value.sliceExtentMillimeters)) &&
    isFiniteNumber(value.sliceCenterHeightMillimeters) &&
    (value.channelMapWindow === null ||
      isProbeChannelMapWindow(value.channelMapWindow)) &&
    (value.shankAlignmentIndex === null ||
      (isFiniteNumber(value.shankAlignmentIndex) &&
        Number.isInteger(value.shankAlignmentIndex) &&
        value.shankAlignmentIndex >= 0)) &&
    (value.bodyModel === null || isSceneModel(value.bodyModel))
  );
}

/**
 * Check that a value has the shape of a `ProbeChannelMapWindow`: an ordered,
 * non-negative mm range.
 * @param value Value to check.
 */
function isProbeChannelMapWindow(
  value: unknown
): value is ProbeChannelMapWindow {
  if (!isRecord(value)) return false;

  const { min, max } = value;
  return isFiniteNumber(min) && isFiniteNumber(max) && min >= 0 && min <= max;
}
