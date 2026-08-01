import { afterEach, beforeEach } from "vitest";

/**
 * Fail fast on any un-mocked network I/O.
 *
 * Some store getters (e.g. `useCurrentExperimentStore`'s `manifest` and
 * `terminologyRows`, both `computedAsync`) fetch eagerly on creation. If a
 * test mounts something that touches one of these without mocking the API
 * module it calls, the request survives past the test's teardown -- happy-dom
 * aborts it when the window tears down, which surfaces as a stray
 * `AbortError`/`ECONNRESET` on stderr well after the run reports its result,
 * rather than as a normal test failure.
 *
 * Stub both transports actually used in this codebase -- `fetch` (axios,
 * zarrita's `FetchStore`) and `XMLHttpRequest` (PapaParse's
 * `download: true` mode) -- so a leak fails the test immediately with a
 * stack pointing at the call site. The fix is to mock the API module under
 * test (see the leaf-module `vi.mock("@/features/atlas/api/source.api", ...)`
 * pattern used throughout this suite), not to touch this file.
 *
 * `XMLHttpRequest` is stubbed rather than deleted: axios picks its adapter by
 * feature-detecting `typeof XMLHttpRequest`, so removing it entirely would
 * make axios fall back to node's real `http` adapter instead.
 */

const originalFetch = globalThis.fetch;
const OriginalXMLHttpRequest = globalThis.XMLHttpRequest;

// Violations are recorded here rather than only thrown at the call site,
// because code under test may itself catch the network error (e.g.
// `getManifest`'s `try { ... } catch { return null; }`) -- swallowing our
// thrown error along with the "real" one it's standing in for. Re-asserting
// this list in `afterEach` means a leak still fails the test even then.
let violations: string[] = [];

function networkGuardError(label: string, target: string): Error {
  return new Error(
    `Un-mocked ${label} call to "${target}" in a test. Mock the API module ` +
      "that issues this request (see the leaf-module vi.mock pattern used " +
      "elsewhere in this suite) instead of letting it hit the network."
  );
}

class GuardedXMLHttpRequest extends OriginalXMLHttpRequest {
  override open(method: string, url: string | URL): void {
    violations.push(`XMLHttpRequest ${method} ${String(url)}`);
    throw networkGuardError("XMLHttpRequest", `${method} ${String(url)}`);
  }
}

beforeEach(() => {
  violations = [];
  globalThis.fetch = (input: RequestInfo | URL) => {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
    violations.push(`fetch ${url}`);
    throw networkGuardError("fetch", url);
  };
  globalThis.XMLHttpRequest =
    GuardedXMLHttpRequest as unknown as typeof XMLHttpRequest;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.XMLHttpRequest = OriginalXMLHttpRequest;

  if (violations.length > 0) {
    throw new Error(
      `Un-mocked network call(s) made during this test:\n${violations.join("\n")}`
    );
  }
});
