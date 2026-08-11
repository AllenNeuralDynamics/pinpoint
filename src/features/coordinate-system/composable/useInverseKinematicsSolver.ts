import { onScopeDispose } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { CoordinateSystemSolution } from "../api/forward-kinematics.api";
import type {
  CoordinateSystemSolveStatus,
  CoordinateSystemTarget
} from "../api/inverse-kinematics.api";
import type { CoordinateSystemNode } from "../model/coordinate-system.model";
import type {
  InboundInverseKinematicsMessage,
  OutboundInverseKinematicsMessage
} from "../model/inverse-kinematics-message.model";

/** The subset of `Worker` the solver depends on. */
export interface InverseKinematicsWorker {
  postMessage(message: InboundInverseKinematicsMessage): void;
  onmessage:
    | ((event: MessageEvent<OutboundInverseKinematicsMessage>) => void)
    | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

/** Builds one solver worker. Overridable in tests to avoid a real `Worker`. */
export type InverseKinematicsWorkerFactory = () => InverseKinematicsWorker;

/** One chain-onto-pose solve, handed to the solver worker. */
export interface InverseKinematicsSolveRequest {
  chain: CoordinateSystemNode[];
  target: CoordinateSystemTarget;
  referenceOffsetMillimeters: [number, number, number] | null;
  maximumStarts: number;
}

/** A completed solve: the solved chain, its status, and its forward solution. */
export interface InverseKinematicsSolveResult {
  status: CoordinateSystemSolveStatus;
  chain: CoordinateSystemNode[];
  solution: CoordinateSystemSolution;
}

/** Default factory for the real inverse-kinematics worker. */
function defaultWorkerFactory(): InverseKinematicsWorker {
  return new Worker(
    new URL("../workers/inverse-kinematics.worker.ts", import.meta.url),
    { type: "module" }
  );
}

/**
 * Create a single-worker inverse-kinematics solver that keeps only the newest queued request.
 * @param workerFactory Builds the solver worker.
 */
export function createInverseKinematicsSolver(
  workerFactory: InverseKinematicsWorkerFactory = defaultWorkerFactory
): {
  solve: (
    request: InverseKinematicsSolveRequest
  ) => Promise<InverseKinematicsSolveResult | null>;
} {
  const worker = workerFactory();

  let nextRequestId = 1;
  let inFlight: {
    requestId: number;
    settle: (result: InverseKinematicsSolveResult | null) => void;
  } | null = null;
  let queued: {
    request: InverseKinematicsSolveRequest;
    settle: (result: InverseKinematicsSolveResult | null) => void;
  } | null = null;

  /**
   * Send one solve request to the worker.
   * @param requestId Id assigned to this request, so its reply can be matched.
   * @param request Solve request to send.
   */
  function post(
    requestId: number,
    request: InverseKinematicsSolveRequest
  ): void {
    worker.postMessage({
      type: "solveInverseKinematics",
      requestId,
      ...request
    });
  }

  function finishInFlight(result: InverseKinematicsSolveResult | null): void {
    inFlight?.settle(result);
    inFlight = null;
    if (!queued) return;
    const requestId = nextRequestId++;
    inFlight = { requestId, settle: queued.settle };
    post(requestId, queued.request);
    queued = null;
  }

  worker.onmessage = event => {
    if (!inFlight || event.data.requestId !== inFlight.requestId) return;
    if (event.data.type === "failedInverseKinematics") {
      finishInFlight(null);
      return;
    }
    const { status, chain, solution } = event.data;
    finishInFlight({ status, chain, solution });
  };

  let isStopped = false;

  function stop(): void {
    isStopped = true;
    inFlight?.settle(null);
    inFlight = null;
    queued?.settle(null);
    queued = null;
  }

  /**
   * Queue one chain-onto-pose solve, resolving `null` when a newer request supersedes it or the
   * solver has stopped.
   * @param request Solve request to send.
   */
  function solve(
    request: InverseKinematicsSolveRequest
  ): Promise<InverseKinematicsSolveResult | null> {
    if (isStopped) return Promise.resolve(null);
    const { promise, resolve } =
      Promise.withResolvers<InverseKinematicsSolveResult | null>();
    if (inFlight === null) {
      const requestId = nextRequestId++;
      inFlight = { requestId, settle: resolve };
      post(requestId, request);
    } else {
      queued?.settle(null);
      queued = { request, settle: resolve };
    }
    return promise;
  }

  worker.onerror = stop;
  onScopeDispose(() => {
    worker.terminate();
    stop();
  });

  return { solve };
}

/** The app-wide inverse-kinematics solver, shared by every consumer. */
export const useInverseKinematicsSolver = createSharedComposable(() =>
  createInverseKinematicsSolver()
);
