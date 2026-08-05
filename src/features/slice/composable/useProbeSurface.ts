import type { Probe } from "@/features/probe";
import { getProbeFrame } from "../api/probe-frame.api";
import {
  findProbeSurfaceTargets,
  type ProbeSurfaceTargets
} from "../api/probe-surface.api";
import { useAnnotationSampler } from "./useAnnotationSampler";

/** Resolve a probe's brain-surface tip targets from the shared annotation sampler. */
export function useProbeSurface(): {
  findTargets: (
    probe: Probe,
    referenceCoordinate: [number, number, number],
    signal?: AbortSignal
  ) => Promise<ProbeSurfaceTargets | null>;
} {
  const { getFinestLevel, sampleOnce } = useAnnotationSampler();

  /**
   * Resolve a probe's brain-surface tip targets, or null when the annotation
   * volume can't be opened.
   * @param probe Probe to find surface targets for.
   * @param referenceCoordinate Experiment reference coordinate, in atlas ASR mm.
   * @param signal Aborts the in-flight sampling.
   */
  async function findTargets(
    probe: Probe,
    referenceCoordinate: [number, number, number],
    signal?: AbortSignal
  ): Promise<ProbeSurfaceTargets | null> {
    const level = await getFinestLevel();
    if (!level) return null;

    return findProbeSurfaceTargets(
      getProbeFrame(probe, referenceCoordinate),
      probe.rotation[2],
      level,
      geometry => sampleOnce(geometry, 0, signal)
    );
  }

  return { findTargets };
}
