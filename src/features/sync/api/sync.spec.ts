import { describe, expect, it } from "vitest";
import { buildExperiment, type Experiment } from "@/features/experiment";
import { makeAtlas } from "@/test/fixtures";
import {
  buildLoginUrl,
  claimExperiment,
  isAuthoredBy,
  partitionExperimentsByAuthor,
  planPull,
  SYNC_ARCHIVE_CONTENT_TYPE,
  type SyncListing,
  touchExperiment
} from "./sync.api";

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
 * @param contentType MIME type the blob was stored under.
 */
function makeListing(
  name: string,
  timestamp: string,
  contentType: string = SYNC_ARCHIVE_CONTENT_TYPE
): SyncListing {
  return { name, timestamp, content_type: contentType };
}

describe("buildLoginUrl", () => {
  it("sends the browser back to the given URL after login", () => {
    expect(buildLoginUrl("https://example.org/pinpoint-v/#/")).toBe(
      "/metadata-viz/auth/orcid/login?next=https%3A%2F%2Fexample.org%2Fpinpoint-v%2F%23%2F"
    );
  });

  it("escapes a return URL's own query string so it survives the round trip", () => {
    expect(buildLoginUrl("https://example.org/?a=1&b=2")).toContain(
      "next=https%3A%2F%2Fexample.org%2F%3Fa%3D1%26b%3D2"
    );
  });
});

describe("touchExperiment", () => {
  it("replaces the timestamp with a parseable one at or after the old", () => {
    const experiment = makeExperiment({
      updatedAt: "2020-01-01T00:00:00.000Z"
    });

    touchExperiment(experiment);

    expect(Date.parse(experiment.updatedAt)).toBeGreaterThan(
      Date.parse("2020-01-01T00:00:00.000Z")
    );
  });
});

describe("claimExperiment", () => {
  it("attaches the author to an unclaimed experiment", () => {
    const experiment = makeExperiment({ author: null });

    claimExperiment(experiment, ALICE);

    expect(experiment.author).toEqual(ALICE);
  });

  it("leaves an already-authored experiment alone", () => {
    const experiment = makeExperiment({ author: BOB });

    claimExperiment(experiment, ALICE);

    expect(experiment.author).toEqual(BOB);
  });
});

describe("isAuthoredBy", () => {
  it("is true for the matching ORCID iD", () => {
    expect(isAuthoredBy(makeExperiment({ author: ALICE }), ALICE.orcid)).toBe(
      true
    );
  });

  it("is false for another ORCID iD", () => {
    expect(isAuthoredBy(makeExperiment({ author: ALICE }), BOB.orcid)).toBe(
      false
    );
  });

  it("is false for an unclaimed experiment", () => {
    expect(isAuthoredBy(makeExperiment({ author: null }), ALICE.orcid)).toBe(
      false
    );
  });
});

describe("partitionExperimentsByAuthor", () => {
  it("splits the author's own experiments from everybody else's", () => {
    const own = makeExperiment({ author: ALICE });
    const foreign = makeExperiment({ author: BOB });
    const unclaimed = makeExperiment({ author: null });

    expect(
      partitionExperimentsByAuthor([own, foreign, unclaimed], ALICE.orcid)
    ).toEqual({ own: [own], foreign: [foreign, unclaimed] });
  });

  it("preserves the input order within each group", () => {
    const first = makeExperiment({ author: ALICE });
    const second = makeExperiment({ author: ALICE });

    expect(
      partitionExperimentsByAuthor([first, second], ALICE.orcid).own
    ).toEqual([first, second]);
  });

  it("puts everything in foreign when no account is signed in", () => {
    const experiment = makeExperiment({ author: ALICE });

    expect(partitionExperimentsByAuthor([experiment], "").foreign).toEqual([
      experiment
    ]);
  });
});

describe("planPull", () => {
  it("downloads an experiment with no local copy", () => {
    const listings = [makeListing("remote-id", "2024-01-01T00:00:00.000Z")];

    expect(planPull(listings, [])).toEqual(["remote-id"]);
  });

  it("downloads an experiment the server holds a newer copy of", () => {
    const local = makeExperiment({ updatedAt: "2024-01-01T00:00:00.000Z" });
    const listings = [makeListing(local.id, "2024-06-01T00:00:00.000Z")];

    expect(planPull(listings, [local])).toEqual([local.id]);
  });

  it("skips an experiment the local copy is newer than", () => {
    const local = makeExperiment({ updatedAt: "2024-06-01T00:00:00.000Z" });
    const listings = [makeListing(local.id, "2024-01-01T00:00:00.000Z")];

    expect(planPull(listings, [local])).toEqual([]);
  });

  it("skips an experiment whose copies are the same age", () => {
    const local = makeExperiment({ updatedAt: "2024-01-01T00:00:00.000Z" });
    const listings = [makeListing(local.id, "2024-01-01T00:00:00.000Z")];

    expect(planPull(listings, [local])).toEqual([]);
  });

  it("skips a blob that isn't an experiment archive", () => {
    const listings = [
      makeListing("some-json", "2024-01-01T00:00:00.000Z", "application/json")
    ];

    expect(planPull(listings, [])).toEqual([]);
  });

  it("skips a blob whose push time can't be parsed", () => {
    const local = makeExperiment({ updatedAt: "2024-01-01T00:00:00.000Z" });
    const listings = [makeListing(local.id, "whenever")];

    expect(planPull(listings, [local])).toEqual([]);
  });

  it("downloads a replacement when the local timestamp can't be parsed", () => {
    const local = makeExperiment({ updatedAt: "whenever" });
    const listings = [makeListing(local.id, "2024-01-01T00:00:00.000Z")];

    expect(planPull(listings, [local])).toEqual([local.id]);
  });
});
