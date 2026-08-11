import type { Probe } from "@/features/probe";
import { getProbeFrame } from "../api/probe-frame.api";
import {
  findProbeSurfaceTargets,
  isInAnnotation,
  isOnAnnotationSurface,
  type ProbeSurfaceTargets
} from "../api/probe-surface.api";
import { useAnnotationSampler } from "./useAnnotationSampler";

/** Resolve a probe's brain-surface tip targets from the shared annotation sampler. */
export function useProbeSurface(): {
  findTargets: (
    probe: Probe,
    signal?: AbortSignal
  ) => Promise<ProbeSurfaceTargets | null>;
  isOnSurface: (
    pointMillimeters: [number, number, number],
    signal?: AbortSignal
  ) => Promise<boolean | null>;
  isInsideBrain: (
    pointMillimeters: [number, number, number],
    signal?: AbortSignal
  ) => Promise<boolean | null>;
} {
  const { getFinestLevel, sampleOnce } = useAnnotationSampler();

  /**
   * Resolve a probe's brain-surface tip targets, or null when the annotation
   * volume can't be opened.
   * @param probe Probe to find surface targets for.
   * @param signal Aborts the in-flight sampling.
   */
  async function findTargets(
    probe: Probe,
    signal?: AbortSignal
  ): Promise<ProbeSurfaceTargets | null> {
    const level = await getFinestLevel();
    if (!level) return null;

    return findProbeSurfaceTargets(
      getProbeFrame(probe),
      probe.rotation[2],
      level,
      geometry => sampleOnce(geometry, 0, signal)
    );
  }

  /**
   * Is a point on the brain's outer surface at the finest atlas level, or null when
   * the annotation volume can't be opened or the sampling was aborted.
   * @param pointMillimeters Point to test, in atlas ASR mm.
   * @param signal Aborts the in-flight sampling.
   */
  async function isOnSurface(
    pointMillimeters: [number, number, number],
    signal?: AbortSignal
  ): Promise<boolean | null> {
    const level = await getFinestLevel();
    if (!level) return null;
    return isOnAnnotationSurface(level, pointMillimeters, geometry =>
      sampleOnce(geometry, 0, signal)
    );
  }

  /**
   * Is a point inside an annotated voxel, i.e. inside the brain, at the finest atlas level, or
   * null when the annotation volume can't be opened or the sampling was aborted.
   * @param pointMillimeters Point to test, in atlas ASR mm.
   * @param signal Aborts the in-flight sampling.
   */
  async function isInsideBrain(
    pointMillimeters: [number, number, number],
    signal?: AbortSignal
  ): Promise<boolean | null> {
    const level = await getFinestLevel();
    if (!level) return null;
    return isInAnnotation(level, pointMillimeters, geometry =>
      sampleOnce(geometry, 0, signal)
    );
  }

  return { findTargets, isOnSurface, isInsideBrain };
}
