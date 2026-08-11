import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { solveCoordinateSystemChainInverse } from "../api/inverse-kinematics.api";
import { createInverseKinematicsSolver } from "./useInverseKinematicsSolver";
import type { CoordinateSystemSolution } from "../api/forward-kinematics.api";
import type {
  InboundInverseKinematicsMessage,
  OutboundInverseKinematicsMessage
} from "../model/inverse-kinematics-message.model";
import type {
  InverseKinematicsSolveRequest,
  InverseKinematicsWorker
} from "./useInverseKinematicsSolver";

// This composable's whole point is to keep solving off the main thread. Scripting the real
// solver here (rather than a real `Worker`, which happy-dom doesn't provide) proves the
// composable never calls it directly -- every solve below is driven entirely by
// `postMessage`/`onmessage` on the fake worker.
vi.mock("../api/inverse-kinematics.api", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../api/inverse-kinematics.api")>();
  return {
    ...actual,
    solveCoordinateSystemChainInverse: vi.fn(
      actual.solveCoordinateSystemChainInverse
    )
  };
});

/** A `Worker` double that records every posted message and exposes its `onmessage` handler. */
interface FakeWorker extends InverseKinematicsWorker {
  posted: InboundInverseKinematicsMessage[];
  terminate: () => void;
}

function makeFakeWorker(): FakeWorker {
  return {
    posted: [],
    onmessage: null,
    onerror: null,
    postMessage(message) {
      this.posted.push(message);
    },
    terminate: vi.fn()
  };
}

/** Build a request targeting a distinct pose, so replies are easy to tell apart. */
function makeRequest(x: number): InverseKinematicsSolveRequest {
  return {
    chain: [],
    target: {
      tipPosition: [x, 0, 0],
      rotation: [0, 0, 0],
      surfacePosition: null
    },
    referenceOffsetMillimeters: null,
    maximumStarts: 1
  };
}

/** Build a distinct solved pose, so replies are easy to tell apart. */
function makeSolution(x: number): CoordinateSystemSolution {
  return { tipPosition: [x, 0, 0], rotation: [0, 0, 0], nodePositions: [] };
}

/** Deliver a reply from the fake worker as a real `Worker` would. */
function reply(
  worker: FakeWorker,
  requestId: number,
  solution: CoordinateSystemSolution
): void {
  worker.onmessage?.({
    data: {
      type: "solvedInverseKinematics",
      requestId,
      status: "converged",
      chain: [],
      solution
    }
  } as unknown as MessageEvent<OutboundInverseKinematicsMessage>);
}

describe("createInverseKinematicsSolver", () => {
  it("posts exactly one solveInverseKinematics message and resolves with the reply's status, chain, and solution", async () => {
    const scope = effectScope();
    const worker = makeFakeWorker();
    const solver = scope.run(() =>
      createInverseKinematicsSolver(() => worker)
    )!;

    const promise = solver.solve(makeRequest(1));

    expect(worker.posted).toEqual([
      { type: "solveInverseKinematics", requestId: 1, ...makeRequest(1) }
    ]);

    const solution = makeSolution(1);
    reply(worker, 1, solution);

    await expect(promise).resolves.toEqual({
      status: "converged",
      chain: [],
      solution
    });
    scope.stop();
  });

  it("never calls the real solver directly - solving is delegated entirely to the worker", async () => {
    const scope = effectScope();
    const worker = makeFakeWorker();
    const solver = scope.run(() =>
      createInverseKinematicsSolver(() => worker)
    )!;

    void solver.solve(makeRequest(1));

    expect(solveCoordinateSystemChainInverse).not.toHaveBeenCalled();
    scope.stop();
  });

  it("supersedes a queued solve with a newer one, and only posts the newest once the first reply lands", async () => {
    const scope = effectScope();
    const worker = makeFakeWorker();
    const solver = scope.run(() =>
      createInverseKinematicsSolver(() => worker)
    )!;

    const first = solver.solve(makeRequest(1));
    const second = solver.solve(makeRequest(2));
    const third = solver.solve(makeRequest(3));

    // Only the in-flight request is ever posted while a solve is running.
    expect(worker.posted).toHaveLength(1);
    await expect(second).resolves.toBeNull();

    const firstSolution = makeSolution(1);
    reply(worker, 1, firstSolution);
    await expect(first).resolves.toEqual({
      status: "converged",
      chain: [],
      solution: firstSolution
    });

    // The newest queued request (third) is posted once the in-flight one settles.
    expect(worker.posted).toEqual([
      { type: "solveInverseKinematics", requestId: 1, ...makeRequest(1) },
      { type: "solveInverseKinematics", requestId: 2, ...makeRequest(3) }
    ]);

    const thirdSolution = makeSolution(3);
    reply(worker, 2, thirdSolution);
    await expect(third).resolves.toEqual({
      status: "converged",
      chain: [],
      solution: thirdSolution
    });
    scope.stop();
  });

  it("terminates the worker and settles the outstanding promise with null when the scope stops", async () => {
    const scope = effectScope();
    const worker = makeFakeWorker();
    const solver = scope.run(() =>
      createInverseKinematicsSolver(() => worker)
    )!;

    const promise = solver.solve(makeRequest(1));
    scope.stop();

    await expect(promise).resolves.toBeNull();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("settles a solve with null when the worker replies with a failure, and still posts the next queued request", async () => {
    const scope = effectScope();
    const worker = makeFakeWorker();
    const solver = scope.run(() =>
      createInverseKinematicsSolver(() => worker)
    )!;

    const first = solver.solve(makeRequest(1));
    const second = solver.solve(makeRequest(2));

    worker.onmessage?.({
      data: { type: "failedInverseKinematics", requestId: 1 }
    } as unknown as MessageEvent<OutboundInverseKinematicsMessage>);

    await expect(first).resolves.toBeNull();
    expect(worker.posted).toEqual([
      { type: "solveInverseKinematics", requestId: 1, ...makeRequest(1) },
      { type: "solveInverseKinematics", requestId: 2, ...makeRequest(2) }
    ]);

    const solution = makeSolution(2);
    reply(worker, 2, solution);
    await expect(second).resolves.toEqual({
      status: "converged",
      chain: [],
      solution
    });
    scope.stop();
  });

  it("settles the in-flight and queued solves with null when the worker errors, and never hangs again", async () => {
    const scope = effectScope();
    const worker = makeFakeWorker();
    const solver = scope.run(() =>
      createInverseKinematicsSolver(() => worker)
    )!;

    const inFlight = solver.solve(makeRequest(1));
    const queued = solver.solve(makeRequest(2));

    worker.onerror?.({} as ErrorEvent);

    await expect(inFlight).resolves.toBeNull();
    await expect(queued).resolves.toBeNull();
    await expect(solver.solve(makeRequest(3))).resolves.toBeNull();
    scope.stop();
  });

  it("resolves null without posting when solve is called after the scope has stopped", async () => {
    const scope = effectScope();
    const worker = makeFakeWorker();
    const solver = scope.run(() =>
      createInverseKinematicsSolver(() => worker)
    )!;
    scope.stop();

    await expect(solver.solve(makeRequest(1))).resolves.toBeNull();
    expect(worker.posted).toEqual([]);
  });
});
