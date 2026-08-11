import type { Probe } from "@/features/probe";
import { getProbeFrame } from "../api/probe-frame.api";
import {
  findProbeSurfaceEntry,
  findProbeSurfaceTargets,
  type ProbeSurfaceTargets
} from "../api/probe-surface.api";
import { useAnnotationSampler } from "./useAnnotationSampler";

/** Resolve a probe's brain-surface tip targets from the shared annotation sampler. */
export function useProbeSurface(): {
  findTargets: (
    probe: Probe,
    signal?: AbortSignal
  ) => Promise<ProbeSurfaceTargets | null>;
  findSurfaceEntry: (
    probe: Probe,
    signal?: AbortSignal
  ) => Promise<[number, number, number] | null>;
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
   * Resolve the probe's brain entry point, in atlas ASR mm, or null when it does not cross the
   * brain or the annotation volume can't be opened.
   * @param probe Probe to resolve the entry point for.
   * @param signal Aborts the in-flight sampling.
   */
  async function findSurfaceEntry(
    probe: Probe,
    signal?: AbortSignal
  ): Promise<[number, number, number] | null> {
    const level = await getFinestLevel();
    if (!level) return null;
    return findProbeSurfaceEntry(getProbeFrame(probe), level, geometry =>
      sampleOnce(geometry, 0, signal)
    );
  }

  return { findTargets, findSurfaceEntry };
}
