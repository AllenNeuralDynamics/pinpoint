import type { Probe } from "@/features/probe";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getProbeFrame } from "../api/probe-frame.api";
import {
  findProbeSurfaceTargets,
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
} {
  const { getFinestLevel, sampleOnce } = useAnnotationSampler();
  const experimentStore = useCurrentExperimentStore();

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

    const { axisDirections, localCoordinateSystem } = experimentStore;
    return findProbeSurfaceTargets(
      getProbeFrame(probe, axisDirections, localCoordinateSystem),
      axisDirections,
      level,
      geometry => sampleOnce(geometry, 0, signal)
    );
  }

  /**
   * Is a point on the brain's outer surface at the finest atlas level, or null when
   * the annotation volume can't be opened or the sampling was aborted.
   * @param pointMillimeters Point to test, in global coordinate system mm.
   * @param signal Aborts the in-flight sampling.
   */
  async function isOnSurface(
    pointMillimeters: [number, number, number],
    signal?: AbortSignal
  ): Promise<boolean | null> {
    const level = await getFinestLevel();
    if (!level) return null;
    return isOnAnnotationSurface(
      level,
      experimentStore.axisDirections,
      pointMillimeters,
      geometry => sampleOnce(geometry, 0, signal)
    );
  }

  return { findTargets, isOnSurface };
}
