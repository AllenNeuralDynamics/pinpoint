import axios from "axios";
import type { ExperimentAuthor } from "@/features/experiment";
import { isRecord } from "@/utils/type-guards";
import {
  SYNC_ARCHIVE_CONTENT_TYPE,
  SYNC_SERVICE_PATH,
  type SyncListing
} from "./sync.api";

/** Client for the metadata-viz endpoints backing sync, scoped to the logged-in account. */
const syncClient = axios.create({
  baseURL: SYNC_SERVICE_PATH,
  // The session lives in a cookie set by the metadata-viz service.
  withCredentials: true
});

/**
 * The logged-in ORCID account, or null when there is no live session.
 */
export async function fetchSyncUser(): Promise<ExperimentAuthor | null> {
  try {
    const { data } = await syncClient.get<unknown>("/auth/me");
    if (!isRecord(data) || typeof data.orcid !== "string") return null;
    return {
      orcid: data.orcid,
      name: typeof data.name === "string" ? data.name : data.orcid
    };
  } catch {
    return null;
  }
}

/**
 * End the logged-in session on the server.
 */
export async function postSyncLogout(): Promise<void> {
  try {
    await syncClient.post("/auth/logout");
  } catch {
    // The local session is dropped either way.
  }
}

/**
 * Metadata of every blob the logged-in account holds, or an empty list on failure.
 */
export async function listSyncedArchives(): Promise<SyncListing[]> {
  try {
    const { data } = await syncClient.get<unknown>("/pinpoint-get");
    return Array.isArray(data) ? data.filter(isSyncListing) : [];
  } catch {
    return [];
  }
}

/**
 * Upload an experiment archive under the experiment's id, replacing any
 * previous copy. Returns whether the upload succeeded.
 * @param experimentId Id of the experiment being pushed, used as the blob name.
 * @param archiveBytes Zipped experiment archive.
 */
export async function pushSyncedArchive(
  experimentId: string,
  archiveBytes: Uint8Array
): Promise<boolean> {
  try {
    await syncClient.post("/pinpoint-post", archiveBytes, {
      params: { name: experimentId },
      headers: { "Content-Type": SYNC_ARCHIVE_CONTENT_TYPE }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Download an experiment archive by blob name, or null when it can't be fetched.
 * @param experimentId Id of the experiment to fetch.
 */
export async function fetchSyncedArchive(
  experimentId: string
): Promise<Uint8Array | null> {
  try {
    const { data } = await syncClient.get<ArrayBuffer>("/pinpoint-get", {
      params: { name: experimentId },
      responseType: "arraybuffer"
    });
    return new Uint8Array(data);
  } catch {
    return null;
  }
}

/**
 * Check that a value has the shape of a `SyncListing`.
 * @param value Value to check.
 */
function isSyncListing(value: unknown): value is SyncListing {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.content_type === "string"
  );
}
