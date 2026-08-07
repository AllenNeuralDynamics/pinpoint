import { toRaw } from "vue";
import type { Atlas } from "@/features/atlas";
import { isSameAtlas } from "@/features/atlas";
import type { CameraPose } from "../models/camera-pose.model";
import type { VisibleStructure } from "../models/visible-structure.model";
import type { Experiment } from "../models/experiment.model";
import type { Probe, ProbeInterfaceProbe } from "@/features/probe";
import {
  detachProbeInterfaceProbe,
  detachProbeInterfaceProbes,
  getProbeInterfaceIdentifier
} from "@/features/probe";

/**
 * Build the visible-structure entries an experiment starts with: every default
 * structure, transparent.
 * @param defaultStructureIdentifiers Identifiers of the atlas's default structures.
 */
export function buildDefaultVisibleStructures(
  defaultStructureIdentifiers: number[]
): VisibleStructure[] {
  return defaultStructureIdentifiers.map(id => ({ id, isTransparent: true }));
}

/**
 * Returns a new experiment with the given name, atlas, and reference coordinate,
 * seeded with the atlas's default structures as transparent.
 * @param name Experiment name.
 * @param atlas Full atlas object.
 * @param referenceCoordinate Reference coordinate of atlas (in ASR, mm).
 * @param defaultStructureIdentifiers Identifiers of the atlas's default structures.
 */
export function buildExperiment(
  name: string,
  atlas: Atlas,
  referenceCoordinate: [number, number, number],
  defaultStructureIdentifiers: number[] = []
): Experiment {
  return {
    id: crypto.randomUUID(),
    version: import.meta.env.APP_VERSION,
    name,
    atlas,
    referenceCoordinate,
    visibleStructures: buildDefaultVisibleStructures(
      defaultStructureIdentifiers
    ),
    probeInterfaceProbes: {},
    probes: [],
    cameraPoses: []
  };
}

/**
 * Deep copy an experiment, keeping its probe interface definitions detached
 * from reactivity.
 * @param experiment Experiment to copy.
 */
export function cloneExperiment(experiment: Experiment): Experiment {
  const copy = JSON.parse(JSON.stringify(toRaw(experiment))) as Experiment;
  detachProbeInterfaceProbes(copy.probeInterfaceProbes);
  return copy;
}

/**
 * Commit edited properties onto an experiment in place, re-seeding the shown
 * structures when the atlas changed since their identifiers are atlas-specific.
 * @param experiment Experiment to update.
 * @param properties Name, atlas, reference coordinate, and default structure
 * identifiers to commit.
 */
export function setExperimentProperties(
  experiment: Experiment,
  properties: {
    name: string;
    atlas: Atlas;
    referenceCoordinate: [number, number, number];
    defaultStructureIdentifiers: number[];
  }
) {
  const { name, atlas, referenceCoordinate, defaultStructureIdentifiers } =
    properties;

  if (!isSameAtlas(atlas, experiment.atlas)) {
    resetStructureVisibility(experiment, defaultStructureIdentifiers);
  }

  experiment.name = name.trim();
  experiment.atlas = { ...atlas };
  experiment.referenceCoordinate = [...referenceCoordinate];
}
/**
 * The experiment's visible-structure entry for a structure, or null when the
 * structure is not shown.
 * @param experiment Experiment to read from.
 * @param identifier Identifier of the structure to look up.
 */
export function getVisibleStructure(
  experiment: Experiment,
  identifier: number
): VisibleStructure | null {
  return (
    experiment.visibleStructures.find(({ id }) => id === identifier) ?? null
  );
}

/**
 * Is the structure fully visible, i.e. shown and not transparent.
 * @param experiment Experiment to check visibility in.
 * @param identifier Identifier of the structure to check.
 */
export function isStructureVisible(experiment: Experiment, identifier: number) {
  return getVisibleStructure(experiment, identifier)?.isTransparent === false;
}

/**
 * Set a structure's visibility: `true` shows it, `null` shows it transparent,
 * and `false` removes it. Replaces any existing entry for the identifier.
 * @param experiment Experiment to set visibility in.
 * @param identifier Identifier of the structure to set the visibility of.
 * @param value Visible, transparent, or not shown.
 */
export function setStructureVisibility(
  experiment: Experiment,
  identifier: number,
  value: boolean | null
) {
  const index = experiment.visibleStructures.findIndex(
    ({ id }) => id === identifier
  );

  if (value === false) {
    if (index !== -1) experiment.visibleStructures.splice(index, 1);
    return;
  }

  const entry: VisibleStructure = {
    id: identifier,
    isTransparent: value === null
  };
  if (index === -1) experiment.visibleStructures.push(entry);
  else experiment.visibleStructures[index] = entry;
}

/**
 * Reset the shown structures back to the atlas's transparent defaults.
 * @param experiment Experiment to reset structure visibility in.
 * @param defaultStructureIdentifiers Identifiers of the atlas's default structures.
 */
export function resetStructureVisibility(
  experiment: Experiment,
  defaultStructureIdentifiers: number[]
) {
  experiment.visibleStructures.length = 0;
  experiment.visibleStructures.push(
    ...buildDefaultVisibleStructures(defaultStructureIdentifiers)
  );
}

/**
 * Intern a probe interface definition into the experiment, keeping the
 * existing definition if one is already interned under that identifier.
 * @param experiment Experiment to intern a probe into.
 * @param probeInterfaceProbe Probe interface definition to intern.
 */
export function internProbeInterfaceProbe(
  experiment: Experiment,
  probeInterfaceProbe: ProbeInterfaceProbe
) {
  const identifier = getProbeInterfaceIdentifier(probeInterfaceProbe);
  if (!experiment.probeInterfaceProbes[identifier]) {
    experiment.probeInterfaceProbes[identifier] =
      detachProbeInterfaceProbe(probeInterfaceProbe);
  }
}

/**
 * Remove a probe interface definition by identifier, unless another probe
 * still references it.
 * @param experiment Experiment to remove an interned probe interface definition from.
 * @param probeIdentifier Probe interface definition identifier.
 */
export function removeInternProbeInterfaceProbe(
  experiment: Experiment,
  probeIdentifier: string
) {
  const stillReferenced = experiment.probes.some(
    experimentProbe =>
      experimentProbe.probeInterfaceIdentifier === probeIdentifier
  );
  if (stillReferenced) return;

  delete experiment.probeInterfaceProbes[probeIdentifier];
}

/**
 * Repoint a probe to a new interface definition, dropping the old one if
 * nothing else uses it.
 * @param experiment Experiment the probe and definitions belong to.
 * @param probe Probe to repoint.
 * @param probeInterfaceProbe New probe interface definition for the probe.
 */
export function setProbeInterface(
  experiment: Experiment,
  probe: Probe,
  probeInterfaceProbe: ProbeInterfaceProbe
) {
  const oldIdentifier = probe.probeInterfaceIdentifier;
  const newIdentifier = getProbeInterfaceIdentifier(probeInterfaceProbe);

  internProbeInterfaceProbe(experiment, probeInterfaceProbe);
  probe.probeInterfaceIdentifier = newIdentifier;
  probe.shankAlignmentIndex = null;
  removeInternProbeInterfaceProbe(experiment, oldIdentifier);
}

/**
 * Resolve a probe's interface definition, or null if it isn't interned.
 * @param experiment Experiment to extract the probe interface definition from.
 * @param probe Probe to resolve the definition of.
 */
export function getInternedProbeInterfaceProbe(
  experiment: Experiment,
  probe: Probe
): ProbeInterfaceProbe | null {
  return (
    experiment.probeInterfaceProbes[probe.probeInterfaceIdentifier] ?? null
  );
}

/**
 * Add a probe to the experiment, unless one with the same id already exists.
 * @param experiment Experiment to add a probe to.
 * @param probe Probe to add.
 */
export function addProbe(experiment: Experiment, probe: Probe) {
  if (experiment.probes.some(existingProbe => existingProbe.id === probe.id))
    return;

  experiment.probes.push(probe);
}

/**
 * Remove a probe from the experiment, dropping its interface definition if
 * no other probe references it.
 * @param experiment Experiment to remove this probe from.
 * @param probe Probe to remove.
 */
export function removeProbe(experiment: Experiment, probe: Probe) {
  const probeIndex = experiment.probes.findIndex(
    experimentProbe => experimentProbe.id === probe.id
  );
  if (probeIndex === -1) return;
  const [removed] = experiment.probes.splice(probeIndex, 1);

  removeInternProbeInterfaceProbe(
    experiment,
    removed!.probeInterfaceIdentifier
  );
}

/**
 * Move a probe within the experiment from one index to another.
 * @param experiment Experiment holding the probes to reorder.
 * @param fromIndex Index of the probe to move.
 * @param toIndex Index to move it to.
 */
export function reorderProbe(
  experiment: Experiment,
  fromIndex: number,
  toIndex: number
) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= experiment.probes.length ||
    toIndex >= experiment.probes.length
  ) {
    return;
  }
  const [probe] = experiment.probes.splice(fromIndex, 1);
  experiment.probes.splice(toIndex, 0, probe!);
}

/**
 * Add a camera pose to the experiment, unless one with the same id already
 * exists.
 * @param experiment Experiment to add a camera pose to.
 * @param pose Camera pose to add.
 */
export function addCameraPose(experiment: Experiment, pose: CameraPose) {
  if (experiment.cameraPoses.some(existingPose => existingPose.id === pose.id))
    return;

  experiment.cameraPoses.push(pose);
}

/**
 * Remove a camera pose from the experiment.
 * @param experiment Experiment to remove this camera pose from.
 * @param pose Camera pose to remove.
 */
export function removeCameraPose(experiment: Experiment, pose: CameraPose) {
  const poseIndex = experiment.cameraPoses.findIndex(
    existingPose => existingPose.id === pose.id
  );
  if (poseIndex === -1) return;
  experiment.cameraPoses.splice(poseIndex, 1);
}

/**
 * Move a camera pose within the experiment from one index to another.
 * @param experiment Experiment holding the camera poses to reorder.
 * @param fromIndex Index of the camera pose to move.
 * @param toIndex Index to move it to.
 */
export function reorderCameraPose(
  experiment: Experiment,
  fromIndex: number,
  toIndex: number
) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= experiment.cameraPoses.length ||
    toIndex >= experiment.cameraPoses.length
  ) {
    return;
  }
  const [pose] = experiment.cameraPoses.splice(fromIndex, 1);
  experiment.cameraPoses.splice(toIndex, 0, pose!);
}
