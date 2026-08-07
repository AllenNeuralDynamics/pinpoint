import {
  type Atlas,
  getAtlasCenter,
  getAtlasDimensionsMillimeters
} from "@/features/atlas";
import type { CameraPose } from "../models/camera-pose.model";
import { atlasToReferenceRelative } from "./reference-coordinate.api";
import { isFiniteNumber, isFiniteTriple, isRecord } from "@/utils/type-guards";

/** Initial orbit azimuth of a camera pose, in radians. */
const INITIAL_ALPHA = -Math.PI / 2;

/** Initial orbit elevation of a camera pose, in radians. */
const INITIAL_BETA = Math.PI / 8;

/** Camera radius that frames an atlas, as a multiple of its AP length. */
const RADIUS_AP_MULTIPLIER = 1.5;

/**
 * Build an experiment's live camera pose: the default orbit, framed on the atlas.
 * @param atlas Atlas to frame the pose on.
 * @param referenceCoordinate Experiment reference coordinate, in atlas ASR mm.
 */
export function buildCameraPose(
  atlas: Atlas,
  referenceCoordinate: [number, number, number]
): CameraPose {
  const pose: CameraPose = {
    inspectableKind: "camera",
    id: crypto.randomUUID(),
    name: "",
    alpha: INITIAL_ALPHA,
    beta: INITIAL_BETA,
    radius: 0,
    target: [0, 0, 0]
  };
  frameCameraPoseOnAtlas(pose, atlas, referenceCoordinate);
  return pose;
}

/**
 * Frame a camera pose on an atlas: radius from the atlas's AP extent and target
 * on the atlas centre, leaving the orbit angles as the user left them.
 * @param pose Camera pose to frame.
 * @param atlas Atlas to frame the pose on.
 * @param referenceCoordinate Experiment reference coordinate, in atlas ASR mm.
 */
export function frameCameraPoseOnAtlas(
  pose: CameraPose,
  atlas: Atlas,
  referenceCoordinate: [number, number, number]
): void {
  pose.radius =
    Math.max(getAtlasDimensionsMillimeters(atlas)[0], 0) * RADIUS_AP_MULTIPLIER;
  pose.target = atlasToReferenceRelative(
    referenceCoordinate,
    getAtlasCenter(atlas)
  );
}

/**
 * Copy a camera pose under a fresh identity and name, for saving it to the library.
 * @param pose Camera pose to copy the orbit and target from.
 * @param name User-facing label for the copy.
 */
export function copyCameraPose(pose: CameraPose, name: string): CameraPose {
  return {
    ...pose,
    id: crypto.randomUUID(),
    name: name.trim(),
    target: [...pose.target]
  };
}

/**
 * Write an orbit and target onto a camera pose in place, keeping its id and name.
 * @param pose Camera pose to update.
 * @param orbit Alpha/beta in radians and radius in mm.
 * @param target Point the camera orbits, relative to the reference coordinate, in ASR mm.
 */
export function setCameraPose(
  pose: CameraPose,
  orbit: [number, number, number],
  target: [number, number, number]
): void {
  pose.alpha = orbit[0];
  pose.beta = orbit[1];
  pose.radius = orbit[2];
  pose.target = [...target];
}

/**
 * Check that a value has the shape of a `CameraPose`.
 * @param value Value to check.
 */
export function isCameraPose(value: unknown): value is CameraPose {
  if (!isRecord(value)) return false;

  return (
    value.inspectableKind === "camera" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    isFiniteNumber(value.alpha) &&
    isFiniteNumber(value.beta) &&
    isFiniteNumber(value.radius) &&
    isFiniteTriple(value.target)
  );
}
