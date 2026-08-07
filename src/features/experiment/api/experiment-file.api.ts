import type { Experiment } from "../models/experiment.model";
import type { VisibleStructure } from "../models/visible-structure.model";
import { isAtlas } from "@/features/atlas";
import { isCameraPose } from "./camera-pose.api";
import {
  getProbeInterfaceIdentifier,
  isProbe,
  isProbeInterfaceProbe
} from "@/features/probe";
import { isFiniteNumber, isFiniteTriple, isRecord } from "@/utils/type-guards";

/** Indentation for written experiment files, so they stay human-diffable. */
const FILE_INDENT = 2;

/** Slug used when an experiment name has no filename-safe characters. */
const FALLBACK_FILE_NAME = "experiment";

/** Longest slug kept from an experiment name, before the `.json` suffix. */
const MAXIMUM_FILE_NAME_LENGTH = 64;

/**
 * Serialize an experiment to the JSON text written to an experiment file.
 * @param experiment Experiment to serialize.
 */
export function serializeExperiment(experiment: Experiment): string {
  return JSON.stringify(experiment, null, FILE_INDENT);
}

/**
 * Parse and validate experiment file text, or null when it isn't a
 * well-formed experiment.
 * @param text Raw contents of an experiment JSON file.
 */
export function parseExperimentFile(text: string): Experiment | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  return isExperiment(data) ? data : null;
}

/**
 * Build a filesystem-safe `.json` file name from an experiment's name.
 * @param experiment Experiment to name the file after.
 */
export function buildExperimentFileName(experiment: Experiment): string {
  const slug = experiment.name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, MAXIMUM_FILE_NAME_LENGTH)
    .replace(/^[-.]+|[-.]+$/g, "");

  return `${slug || FALLBACK_FILE_NAME}.json`;
}

/**
 * Check that a value has the shape of an `Experiment`, including the
 * cross-references its consumers assume hold.
 * @param value Value to check.
 */
function isExperiment(value: unknown): value is Experiment {
  if (!isRecord(value)) return false;

  const {
    id,
    version,
    name,
    atlas,
    referenceCoordinate,
    visibleStructures,
    probeInterfaceProbes,
    probes,
    cameraPose,
    cameraPoses
  } = value;

  if (typeof id !== "string") return false;
  if (typeof version !== "string") return false;
  if (typeof name !== "string") return false;
  if (!isAtlas(atlas)) return false;
  if (!isFiniteTriple(referenceCoordinate)) return false;
  if (
    !Array.isArray(visibleStructures) ||
    !visibleStructures.every(isVisibleStructure)
  ) {
    return false;
  }
  if (
    new Set(visibleStructures.map(({ id }: VisibleStructure) => id)).size !==
    visibleStructures.length
  ) {
    return false;
  }
  if (!isRecord(probeInterfaceProbes)) return false;

  for (const [identifier, definition] of Object.entries(probeInterfaceProbes)) {
    if (!isProbeInterfaceProbe(definition)) return false;
    if (getProbeInterfaceIdentifier(definition) !== identifier) return false;
  }

  if (!Array.isArray(probes) || !probes.every(isProbe)) return false;
  if (new Set(probes.map(probe => probe.id)).size !== probes.length) {
    return false;
  }

  if (!isCameraPose(cameraPose)) return false;
  if (!Array.isArray(cameraPoses) || !cameraPoses.every(isCameraPose)) {
    return false;
  }
  if (new Set(cameraPoses.map(pose => pose.id)).size !== cameraPoses.length) {
    return false;
  }

  return probes.every(probe =>
    Object.hasOwn(probeInterfaceProbes, probe.probeInterfaceIdentifier)
  );
}

/**
 * Check that a value has the shape of a `VisibleStructure`.
 * @param value Value to check.
 */
function isVisibleStructure(value: unknown): value is VisibleStructure {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.isTransparent === "boolean"
  );
}
