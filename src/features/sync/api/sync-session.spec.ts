import { describe, expect, it, vi } from "vitest";
import { buildExperiment, type Experiment } from "@/features/experiment";
import { makeAtlas } from "@/test/fixtures";
import { SYNC_ARCHIVE_CONTENT_TYPE, type SyncListing } from "./sync.api";
import {
  type PullDependencies,
  pullSyncedExperiments,
  reconcileAuthorship
} from "./sync-session.api";

const ALICE = { orcid: "0000-0001-2345-6789", name: "Alice" };
const BOB = { orcid: "0000-0002-9999-0000", name: "Bob" };

/**
 * Build an experiment with an explicit author and edit timestamp.
 * @param overrides Author and `updatedAt` to apply.
 */
function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return { ...buildExperiment("A", makeAtlas(), [0, 0, 0]), ...overrides };
}

/**
 * Build a synced-archive listing entry.
 * @param name Blob name, which is the experiment id.
 * @param timestamp ISO-8601 push time.
 */
function makeListing(name: string, timestamp: string): SyncListing {
  return { name, timestamp, content_type: SYNC_ARCHIVE_CONTENT_TYPE };
}

/**
 * Build pull dependencies serving the given experiments by id.
 * @param experimentsById Experiments each archive restores to, keyed by blob name.
 */
function makePullDependencies(
  experimentsById: Record<string, Experiment | null>
): PullDependencies {
  const bytesToId = new Map<string, string>();
  return {
    fetchArchive: vi.fn(async (experimentId: string) => {
      if (!(experimentId in experimentsById)) {
        throw new Error(`no blob named ${experimentId}`);
      }
      const marker = `archive:${experimentId}`;
      bytesToId.set(marker, experimentId);
      return new TextEncoder().encode(marker);
    }),
    restoreArchive: vi.fn(async (archiveBytes: Uint8Array) => {
      const experimentId = bytesToId.get(
        new TextDecoder().decode(archiveBytes)
      );
      const experiment = experimentId
        ? experimentsById[experimentId]
        : undefined;
      return experiment ? { experiment } : null;
    })
  };
}

describe("reconcileAuthorship", () => {
  it("claims every unclaimed experiment for the signed-in author", () => {
    const experiment = makeExperiment({ author: null });

    reconcileAuthorship([experiment], ALICE, vi.fn());

    expect(experiment.author).toEqual(ALICE);
  });

  it("leaves sync on for the experiments it just claimed", () => {
    const experiment = makeExperiment({ author: null });
    const setSyncEnabled = vi.fn();

    reconcileAuthorship([experiment], ALICE, setSyncEnabled);

    expect(setSyncEnabled).not.toHaveBeenCalled();
  });

  it("turns sync off for another author's experiment", () => {
    const experiment = makeExperiment({ author: BOB });
    const setSyncEnabled = vi.fn();

    reconcileAuthorship([experiment], ALICE, setSyncEnabled);

    expect(setSyncEnabled).toHaveBeenCalledWith(experiment.id, false);
  });

  it("leaves another author's experiment attributed to them", () => {
    const experiment = makeExperiment({ author: BOB });

    reconcileAuthorship([experiment], ALICE, vi.fn());

    expect(experiment.author).toEqual(BOB);
  });

  it("leaves the signed-in author's own experiments untouched", () => {
    const experiment = makeExperiment({ author: ALICE });
    const setSyncEnabled = vi.fn();

    reconcileAuthorship([experiment], ALICE, setSyncEnabled);

    expect(setSyncEnabled).not.toHaveBeenCalled();
    expect(experiment.author).toEqual(ALICE);
  });
});

describe("pullSyncedExperiments", () => {
  it("returns the experiments this computer is missing", async () => {
    const remote = makeExperiment({ author: ALICE });
    const dependencies = makePullDependencies({ [remote.id]: remote });

    await expect(
      pullSyncedExperiments(
        [makeListing(remote.id, "2024-01-01T00:00:00.000Z")],
        [],
        dependencies
      )
    ).resolves.toEqual({ experiments: [remote], failedIds: [] });
  });

  it("does not fetch an experiment the local copy is newer than", async () => {
    const local = makeExperiment({ updatedAt: "2024-06-01T00:00:00.000Z" });
    const dependencies = makePullDependencies({ [local.id]: local });

    await expect(
      pullSyncedExperiments(
        [makeListing(local.id, "2024-01-01T00:00:00.000Z")],
        [local],
        dependencies
      )
    ).resolves.toEqual({ experiments: [], failedIds: [] });
    expect(dependencies.fetchArchive).not.toHaveBeenCalled();
  });

  it("reports a blob that can't be downloaded", async () => {
    const dependencies = makePullDependencies({});

    await expect(
      pullSyncedExperiments(
        [makeListing("gone", "2024-01-01T00:00:00.000Z")],
        [],
        dependencies
      )
    ).resolves.toEqual({ experiments: [], failedIds: ["gone"] });
  });

  it("reports an archive that isn't a well-formed experiment", async () => {
    const dependencies = makePullDependencies({ broken: null });

    await expect(
      pullSyncedExperiments(
        [makeListing("broken", "2024-01-01T00:00:00.000Z")],
        [],
        dependencies
      )
    ).resolves.toEqual({ experiments: [], failedIds: ["broken"] });
  });

  it("reports an archive whose experiment id does not match its blob name", async () => {
    const impostor = makeExperiment({ author: BOB });
    const dependencies = makePullDependencies({ "some-other-id": impostor });

    await expect(
      pullSyncedExperiments(
        [makeListing("some-other-id", "2024-01-01T00:00:00.000Z")],
        [],
        dependencies
      )
    ).resolves.toEqual({ experiments: [], failedIds: ["some-other-id"] });
  });

  it("keeps going after one blob fails", async () => {
    const good = makeExperiment({ author: ALICE });
    const dependencies = makePullDependencies({
      missing: null,
      [good.id]: good
    });

    await expect(
      pullSyncedExperiments(
        [
          makeListing("missing", "2024-01-01T00:00:00.000Z"),
          makeListing(good.id, "2024-01-01T00:00:00.000Z")
        ],
        [],
        dependencies
      )
    ).resolves.toEqual({ experiments: [good], failedIds: ["missing"] });
  });
});
