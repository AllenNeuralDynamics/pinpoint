import type { CameraPose } from "../models/camera-pose.model";
import { isFiniteNumber, isRecord } from "@/utils/type-guards";

/**
 * Build a camera pose from a name and an alpha/beta/radius orbit.
 * @param name User-facing label for the pose.
 * @param orbit Alpha/beta in radians and radius in mm to save.
 */
export function buildCameraPose(
  name: string,
  orbit: [number, number, number]
): CameraPose {
  const [alpha, beta, radius] = orbit;
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    alpha,
    beta,
    radius
  };
}

/**
 * Check that a value has the shape of a `CameraPose`.
 * @param value Value to check.
 */
export function isCameraPose(value: unknown): value is CameraPose {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    isFiniteNumber(value.alpha) &&
    isFiniteNumber(value.beta) &&
    isFiniteNumber(value.radius)
  );
}
