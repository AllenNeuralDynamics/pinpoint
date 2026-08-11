import {
  strFromU8,
  strToU8,
  type Unzipped,
  unzipSync,
  type Zippable,
  zipSync
} from "fflate";
import type { Experiment } from "../models/experiment.model";
import type { VisibleStructure } from "../models/visible-structure.model";
import { getExperimentModelIds } from "./experiment.api";
import { isAtlas } from "@/features/atlas";
import {
  getCoordinateSystemIdentifier,
  isCoordinateSystem
} from "@/features/coordinate-system";
import { isCameraPose } from "./camera-pose.api";
import {
  getProbeInterfaceIdentifier,
  isProbe,
  isProbeInterfaceProbe
} from "@/features/probe";
import { isSceneObject } from "@/features/scene";
import { isFiniteNumber, isFiniteTriple, isRecord } from "@/utils/type-guards";

/** Indentation for written experiment files, so they stay human-diffable. */
const FILE_INDENT = 2;

/** Slug used when an experiment name has no filename-safe characters. */
const FALLBACK_FILE_NAME = "experiment";

/** Longest slug kept from an experiment name, before the `.zip` suffix. */
const MAXIMUM_FILE_NAME_LENGTH = 64;

/** Name every experiment zip stores its experiment JSON under. */
const EXPERIMENT_ENTRY_NAME = "experiment.json";

/** Directory inside an experiment zip holding one model file per scene model. */
const MODEL_DIRECTORY = "models";

/** Deflate level for the experiment JSON entry. */
const JSON_DEFLATE_LEVEL = 6;

/** MIME type of a written experiment file. */
export const EXPERIMENT_FILE_MIME_TYPE = "application/zip";

/** A scene model's file as carried by an experiment zip. */
export interface SceneModelFile {
  /** Original file name the model was imported under, which decides its loader. */
  fileName: string;
  /** File bytes, byte-for-byte as imported. */
  bytes: Uint8Array;
}

/** An experiment read out of an experiment zip, with its model files. */
export interface ExperimentArchive {
  experiment: Experiment;
  /** Model files keyed by scene model id, for the models the zip carried. */
  models: Map<string, SceneModelFile>;
}

/**
 * Serialize an experiment to the JSON text written to an experiment file.
 * @param experiment Experiment to serialize.
 */
function serializeExperiment(experiment: Experiment): string {
  return JSON.stringify(experiment, null, FILE_INDENT);
}

/**
 * Parse and validate experiment file text, or null when it isn't a
 * well-formed experiment.
 * @param text Raw contents of an experiment JSON file.
 */
function parseExperimentFile(text: string): Experiment | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  return isExperiment(data) ? data : null;
}

/**
 * Build a zip containing an experiment's JSON and one model file per given
 * scene model, deflated with the JSON, since text formats like `.obj`
 * compress well.
 * @param experiment Experiment to zip.
 * @param models Model files keyed by scene model id, for the models to include.
 */
export function zipExperiment(
  experiment: Experiment,
  models: Map<string, SceneModelFile>
): Uint8Array {
  const entries: Zippable = {
    [EXPERIMENT_ENTRY_NAME]: strToU8(serializeExperiment(experiment))
  };
  for (const [id, { fileName, bytes }] of models) {
    entries[`${MODEL_DIRECTORY}/${id}/${fileName}`] = bytes;
  }

  return zipSync(entries, { level: JSON_DEFLATE_LEVEL });
}

/**
 * Read an experiment zip back into its experiment and the model files it
 * carried, or null when the bytes aren't a well-formed experiment zip.
 * @param zipBytes Zip bytes read from an experiment file.
 */
export function unzipExperiment(
  zipBytes: Uint8Array
): ExperimentArchive | null {
  let entries: Unzipped;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    return null;
  }

  const experimentEntry = entries[EXPERIMENT_ENTRY_NAME];
  if (!experimentEntry) return null;

  const experiment = parseExperimentFile(strFromU8(experimentEntry));
  if (!experiment) return null;

  const models = new Map<string, SceneModelFile>();
  for (const modelId of getExperimentModelIds(experiment)) {
    const prefix = `${MODEL_DIRECTORY}/${modelId}/`;
    const entry = Object.entries(entries).find(([name]) =>
      name.startsWith(prefix)
    );
    if (!entry) continue;
    const fileName = entry[0].slice(prefix.length);
    if (fileName) models.set(modelId, { fileName, bytes: entry[1] });
  }

  return { experiment, models };
}

/**
 * Build a filesystem-safe `.zip` file name from an experiment's name.
 * @param experiment Experiment to name the file after.
 */
export function buildExperimentFileName(experiment: Experiment): string {
  const slug = experiment.name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, MAXIMUM_FILE_NAME_LENGTH)
    .replace(/^[-.]+|[-.]+$/g, "");

  return `${slug || FALLBACK_FILE_NAME}.zip`;
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
    coordinateSystems,
    probes,
    sceneObjects,
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

  if (!isRecord(coordinateSystems)) return false;

  for (const [identifier, definition] of Object.entries(coordinateSystems)) {
    if (!isCoordinateSystem(definition)) return false;
    if (getCoordinateSystemIdentifier(definition) !== identifier) return false;
  }

  if (!Array.isArray(probes) || !probes.every(isProbe)) return false;
  if (new Set(probes.map(probe => probe.id)).size !== probes.length) {
    return false;
  }

  if (!Array.isArray(sceneObjects) || !sceneObjects.every(isSceneObject)) {
    return false;
  }
  if (
    new Set(sceneObjects.map(sceneObject => sceneObject.id)).size !==
    sceneObjects.length
  ) {
    return false;
  }

  if (!isCameraPose(cameraPose)) return false;
  if (!Array.isArray(cameraPoses) || !cameraPoses.every(isCameraPose)) {
    return false;
  }
  if (new Set(cameraPoses.map(pose => pose.id)).size !== cameraPoses.length) {
    return false;
  }

  return probes.every(
    probe =>
      Object.hasOwn(probeInterfaceProbes, probe.probeInterfaceIdentifier) &&
      Object.hasOwn(coordinateSystems, probe.coordinateSystemIdentifier)
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
