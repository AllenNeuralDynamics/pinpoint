import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { buildExperiment, type Experiment } from "@/features/experiment";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { useRecentExperimentsStore } from "@/stores/recent-experiments.store";
import { useSyncStore } from "@/stores/sync.store";
import { makeAtlas } from "@/test/fixtures";
import { useExperimentSync } from "./useExperimentSync";
import {
  fetchSyncedArchive,
  fetchSyncUser,
  listSyncedArchives,
  postSyncLogout,
  pushSyncedArchive
} from "../api/sync-client.api";
import {
  buildExperimentArchive,
  restoreExperimentArchive
} from "../api/experiment-archive.api";

const ALICE = { orcid: "0000-0001-2345-6789", name: "Alice" };
const BOB = { orcid: "0000-0002-9999-0000", name: "Bob" };

// The store's `terminologyRows` is a `computedAsync` that fetches on store
// creation, so the leaf source module is stubbed to keep the network out.
vi.mock("@/features/atlas/api/source.api", async () => {
  // The inline `typeof import(...)` is the repo's spec-mock convention; a
  // top-level import of a feature-internal module is lint-restricted.
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return { ...actual, getTerminologyRows: vi.fn().mockResolvedValue([]) };
});

vi.mock("../api/sync-client.api", () => ({
  fetchSyncUser: vi.fn(),
  postSyncLogout: vi.fn(),
  listSyncedArchives: vi.fn(),
  pushSyncedArchive: vi.fn(),
  fetchSyncedArchive: vi.fn()
}));

vi.mock("../api/experiment-archive.api", () => ({
  buildExperimentArchive: vi.fn(),
  restoreExperimentArchive: vi.fn()
}));

/**
 * Build an experiment held on this computer.
 * @param overrides Fields to apply on top of a fresh experiment.
 */
function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return { ...buildExperiment("A", makeAtlas(), [0, 0, 0]), ...overrides };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchSyncUser).mockReset();
  vi.mocked(postSyncLogout).mockReset().mockResolvedValue(undefined);
  vi.mocked(listSyncedArchives).mockReset().mockResolvedValue([]);
  vi.mocked(pushSyncedArchive).mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchSyncedArchive).mockReset();
  vi.mocked(buildExperimentArchive)
    .mockReset()
    .mockResolvedValue(new Uint8Array([1]));
  vi.mocked(restoreExperimentArchive).mockReset();
});

describe("restoreSession", () => {
  it("signs in and mirrors the account's experiments", async () => {
    vi.mocked(fetchSyncUser).mockResolvedValue(ALICE);
    const { restoreSession } = useExperimentSync();
    const syncStore = useSyncStore();
    const currentExperimentStore = useCurrentExperimentStore();

    await restoreSession();

    expect(syncStore.user).toEqual(ALICE);
    expect(syncStore.status).toBe("idle");
    expect(syncStore.lastSyncedAt).not.toBeNull();
    expect(pushSyncedArchive).toHaveBeenCalledWith(
      currentExperimentStore.experiment.id,
      new Uint8Array([1])
    );
  });

  it("signs out when the server reports no session", async () => {
    vi.mocked(fetchSyncUser).mockResolvedValue(null);
    const syncStore = useSyncStore();
    syncStore.signIn(ALICE);
    const { restoreSession } = useExperimentSync();

    await restoreSession();

    expect(syncStore.user).toBeNull();
    expect(syncStore.status).toBe("idle");
    expect(pushSyncedArchive).not.toHaveBeenCalled();
  });

  it("keeps the remembered account and fails when the service is unreachable", async () => {
    vi.mocked(fetchSyncUser).mockRejectedValue(new Error("network error"));
    const syncStore = useSyncStore();
    syncStore.signIn(ALICE);
    const { restoreSession } = useExperimentSync();

    await restoreSession();

    expect(syncStore.user).toEqual(ALICE);
    expect(syncStore.status).toBe("failed");
    expect(syncStore.lastSyncedAt).toBeNull();
  });

  it("fails when an experiment can't be pushed", async () => {
    vi.mocked(fetchSyncUser).mockResolvedValue(ALICE);
    vi.mocked(pushSyncedArchive).mockRejectedValue(new Error("network error"));
    const { restoreSession } = useExperimentSync();
    const syncStore = useSyncStore();

    await restoreSession();

    expect(syncStore.status).toBe("failed");
    expect(syncStore.lastSyncedAt).toBeNull();
  });

  it("fails when a blob on the server can't be pulled", async () => {
    vi.mocked(fetchSyncUser).mockResolvedValue(ALICE);
    vi.mocked(listSyncedArchives).mockResolvedValue([
      {
        name: "missing",
        timestamp: "2099-01-01T00:00:00.000Z",
        content_type: "application/zip"
      }
    ]);
    vi.mocked(fetchSyncedArchive).mockRejectedValue(new Error("404"));
    const { restoreSession } = useExperimentSync();
    const syncStore = useSyncStore();

    await restoreSession();

    expect(syncStore.status).toBe("failed");
  });

  it("adopts the server's copy of an experiment this computer is missing", async () => {
    const remote = makeExperiment({ author: ALICE });
    vi.mocked(fetchSyncUser).mockResolvedValue(ALICE);
    vi.mocked(listSyncedArchives).mockResolvedValue([
      {
        name: remote.id,
        timestamp: "2099-01-01T00:00:00.000Z",
        content_type: "application/zip"
      }
    ]);
    vi.mocked(fetchSyncedArchive).mockResolvedValue(new Uint8Array([2]));
    vi.mocked(restoreExperimentArchive).mockResolvedValue({
      experiment: remote
    });
    const { restoreSession } = useExperimentSync();
    const recentExperimentsStore = useRecentExperimentsStore();
    const syncStore = useSyncStore();

    await restoreSession();

    expect(recentExperimentsStore.recents).toEqual([remote]);
    expect(syncStore.status).toBe("idle");
  });

  it("does not mirror another author's experiment", async () => {
    vi.mocked(fetchSyncUser).mockResolvedValue(ALICE);
    const foreign = makeExperiment({ author: BOB });
    const recentExperimentsStore = useRecentExperimentsStore();
    recentExperimentsStore.add(foreign);
    const { restoreSession } = useExperimentSync();

    await restoreSession();

    expect(pushSyncedArchive).not.toHaveBeenCalledWith(
      foreign.id,
      expect.anything()
    );
  });
});

describe("syncNow", () => {
  it("mirrors again for the signed-in account", async () => {
    const syncStore = useSyncStore();
    syncStore.signIn(ALICE);
    const { syncNow } = useExperimentSync();
    const currentExperimentStore = useCurrentExperimentStore();

    await syncNow();

    expect(pushSyncedArchive).toHaveBeenCalledWith(
      currentExperimentStore.experiment.id,
      new Uint8Array([1])
    );
    expect(fetchSyncUser).not.toHaveBeenCalled();
    expect(syncStore.status).toBe("idle");
  });

  it("does nothing while signed out", async () => {
    const { syncNow } = useExperimentSync();

    await syncNow();

    expect(listSyncedArchives).not.toHaveBeenCalled();
    expect(pushSyncedArchive).not.toHaveBeenCalled();
  });
});

describe("pushExperiment", () => {
  it("marks the sync as failed when the upload fails", async () => {
    const syncStore = useSyncStore();
    syncStore.signIn(ALICE);
    const experiment = makeExperiment({ author: ALICE });
    vi.mocked(pushSyncedArchive).mockRejectedValue(new Error("network error"));
    const { pushExperiment } = useExperimentSync();

    await pushExperiment(experiment);

    expect(syncStore.status).toBe("failed");
  });

  it("skips an experiment the user turned sync off for", async () => {
    const syncStore = useSyncStore();
    syncStore.signIn(ALICE);
    const experiment = makeExperiment({ author: ALICE });
    syncStore.setSyncEnabled(experiment.id, false);
    const { pushExperiment } = useExperimentSync();

    await pushExperiment(experiment);

    expect(pushSyncedArchive).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("ends the server session and forgets the account", async () => {
    const syncStore = useSyncStore();
    syncStore.signIn(ALICE);
    const { signOut } = useExperimentSync();

    await signOut();

    expect(postSyncLogout).toHaveBeenCalled();
    expect(syncStore.user).toBeNull();
  });
});
