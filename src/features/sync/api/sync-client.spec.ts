import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSyncedArchive,
  fetchSyncUser,
  listSyncedArchives,
  postSyncLogout,
  pushSyncedArchive
} from "./sync-client.api";

const { mockCreate, mockGet, mockPost } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  return {
    mockGet,
    mockPost,
    mockCreate: vi.fn(() => ({ get: mockGet, post: mockPost }))
  };
});

vi.mock("axios", () => ({ default: { create: mockCreate } }));

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe("the sync client", () => {
  it("sends session cookies to the metadata-viz service", () => {
    expect(mockCreate).toHaveBeenCalledWith({
      baseURL: "https://data.allenneuraldynamics.org/metadata-viz",
      withCredentials: true
    });
  });
});

describe("fetchSyncUser", () => {
  it("returns the signed-in account", async () => {
    mockGet.mockResolvedValue({
      data: { orcid: "0000-0001-2345-6789", name: "Alice" }
    });

    await expect(fetchSyncUser()).resolves.toEqual({
      orcid: "0000-0001-2345-6789",
      name: "Alice"
    });
    expect(mockGet).toHaveBeenCalledWith("/auth/me");
  });

  it("falls back to the ORCID iD when the account has no name", async () => {
    mockGet.mockResolvedValue({ data: { orcid: "0000-0001-2345-6789" } });

    await expect(fetchSyncUser()).resolves.toEqual({
      orcid: "0000-0001-2345-6789",
      name: "0000-0001-2345-6789"
    });
  });

  it("returns null when nobody is signed in", async () => {
    mockGet.mockRejectedValue(new Error("401"));

    await expect(fetchSyncUser()).resolves.toBeNull();
  });

  it("returns null for a response without an ORCID iD", async () => {
    mockGet.mockResolvedValue({ data: { name: "Alice" } });

    await expect(fetchSyncUser()).resolves.toBeNull();
  });
});

describe("postSyncLogout", () => {
  it("ends the session on the server", async () => {
    mockPost.mockResolvedValue({});

    await postSyncLogout();

    expect(mockPost).toHaveBeenCalledWith("/auth/logout");
  });

  it("resolves even when the request fails", async () => {
    mockPost.mockRejectedValue(new Error("network error"));

    await expect(postSyncLogout()).resolves.toBeUndefined();
  });
});

describe("listSyncedArchives", () => {
  it("returns the account's blob metadata", async () => {
    const listing = {
      name: "abc",
      timestamp: "2024-01-01T00:00:00.000Z",
      content_type: "application/zip"
    };
    mockGet.mockResolvedValue({ data: [listing] });

    await expect(listSyncedArchives()).resolves.toEqual([listing]);
    expect(mockGet).toHaveBeenCalledWith("/pinpoint-get");
  });

  it("drops entries that aren't well-formed listings", async () => {
    mockGet.mockResolvedValue({ data: [{ name: "abc" }, null, 5] });

    await expect(listSyncedArchives()).resolves.toEqual([]);
  });

  it("returns an empty list when the response isn't an array", async () => {
    mockGet.mockResolvedValue({ data: { error: "nope" } });

    await expect(listSyncedArchives()).resolves.toEqual([]);
  });

  it("returns an empty list when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("network error"));

    await expect(listSyncedArchives()).resolves.toEqual([]);
  });
});

describe("pushSyncedArchive", () => {
  it("posts the archive as a zip under the experiment's id", async () => {
    mockPost.mockResolvedValue({});
    const archiveBytes = new Uint8Array([1, 2, 3]);

    await expect(pushSyncedArchive("abc", archiveBytes)).resolves.toBe(true);
    expect(mockPost).toHaveBeenCalledWith("/pinpoint-post", archiveBytes, {
      params: { name: "abc" },
      headers: { "Content-Type": "application/zip" }
    });
  });

  it("reports failure rather than throwing", async () => {
    mockPost.mockRejectedValue(new Error("network error"));

    await expect(pushSyncedArchive("abc", new Uint8Array([1]))).resolves.toBe(
      false
    );
  });
});

describe("fetchSyncedArchive", () => {
  it("returns the archive bytes", async () => {
    mockGet.mockResolvedValue({ data: new Uint8Array([1, 2, 3]).buffer });

    await expect(fetchSyncedArchive("abc")).resolves.toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(mockGet).toHaveBeenCalledWith("/pinpoint-get", {
      params: { name: "abc" },
      responseType: "arraybuffer"
    });
  });

  it("returns null when the blob can't be fetched", async () => {
    mockGet.mockRejectedValue(new Error("404"));

    await expect(fetchSyncedArchive("abc")).resolves.toBeNull();
  });
});
