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
 * The logged-in ORCID account, or null when the server reports no live
 * session. Throws when the service can't be reached, so a network failure is
 * not mistaken for a sign-out.
 */
export async function fetchSyncUser(): Promise<ExperimentAuthor | null> {
  try {
    const { data } = await syncClient.get<unknown>("/auth/me");
    if (!isRecord(data) || typeof data.orcid !== "string") return null;
    return {
      orcid: data.orcid,
      name: typeof data.name === "string" ? data.name : data.orcid
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401)
      return null;
    throw error;
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

/** Metadata of every blob the logged-in account holds. */
export async function listSyncedArchives(): Promise<SyncListing[]> {
  const { data } = await syncClient.get<unknown>("/pinpoint-get");
  return Array.isArray(data) ? data.filter(isSyncListing) : [];
}

/**
 * Upload an experiment archive under the experiment's id, replacing any
 * previous copy.
 * @param experimentId Id of the experiment being pushed, used as the blob name.
 * @param archiveBytes Zipped experiment archive.
 */
export async function pushSyncedArchive(
  experimentId: string,
  archiveBytes: Uint8Array
): Promise<void> {
  await syncClient.post("/pinpoint-post", archiveBytes, {
    params: { name: experimentId },
    headers: { "Content-Type": SYNC_ARCHIVE_CONTENT_TYPE }
  });
}

/**
 * Download an experiment archive by blob name.
 * @param experimentId Id of the experiment to fetch.
 */
export async function fetchSyncedArchive(
  experimentId: string
): Promise<Uint8Array> {
  const { data } = await syncClient.get<ArrayBuffer>("/pinpoint-get", {
    params: { name: experimentId },
    responseType: "arraybuffer"
  });
  return new Uint8Array(data);
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
