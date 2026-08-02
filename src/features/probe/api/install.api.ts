import axios from "axios";
import type {
  ProbeInterfaceFile,
  ProbeInterfaceProbe
} from "../models/probe-interface.model";
import { isProbeInterfaceProbe } from "./probe.api";
import { isRecord } from "@/utils/type-guards";

interface GitHubItem {
  name: string;
  type: string;
}
interface GitHub404 {
  status: string;
}
type GitHubItemResponse = GitHubItem[] | GitHub404;

/** Client for the GitHub repository contents API. */
const githubApi = axios.create({
  baseURL:
    "https://api.github.com/repos/SpikeInterface/probeinterface_library/contents",
  headers: {
    Accept: "application/vnd.github+json"
  }
});

const FILE_API_BASE_URL =
  "https://raw.githubusercontent.com/SpikeInterface/probeinterface_library/main/";

/** Client for fetching raw file contents from GitHub. */
const fileApi = axios.create({
  baseURL: FILE_API_BASE_URL
});

/**
 * Return the top-level non-scripting folders, i.e. the probe manufacturers.
 */
export async function getManufacturers(): Promise<string[]> {
  try {
    const { data } = await githubApi.get<GitHubItemResponse>("/");

    // Exit if we can't find manufacturers.
    if (!data || isGitHub404(data)) return [];

    return data
      .filter(
        item =>
          item.type === "dir" &&
          !item.name.startsWith(".") &&
          !["apps", "scripts"].includes(item.name)
      )
      .map(item => item.name);
  } catch {
    return [];
  }
}

/**
 * Return the names of probe directories in a manufacturer's folder.
 * @param manufacturer Manufacturer to get probes from.
 */
export async function getProbeNames(manufacturer: string): Promise<string[]> {
  try {
    const { data } = await githubApi.get<GitHubItemResponse>(
      `/${manufacturer}`
    );
    if (!data || isGitHub404(data)) return [];

    return data.filter(item => item.type === "dir").map(item => item.name);
  } catch {
    return [];
  }
}

/**
 * Check if a GitHub response was a 404 message.
 * @param response response data from a GitHub content fetch.
 */
function isGitHub404(response: GitHubItemResponse): response is GitHub404 {
  return !Array.isArray(response) && response.status === "404";
}

/**
 * Fetch a probe's ProbeInterface specification, extracting its first probe.
 * Returns null if the probe can't be fetched or is missing required fields.
 * @param manufacturer Manufacturer to get probe from.
 * @param name Probe from manufacturer.
 */
export async function getProbeInterfaceProbe(
  manufacturer: string,
  name: string
): Promise<ProbeInterfaceProbe | null> {
  try {
    const { data } = await fileApi.get<ProbeInterfaceFile>(
      `/${manufacturer}/${name}/${name}.json`
    );

    return firstValidProbe(data);
  } catch {
    return null;
  }
}

/**
 * Return a probe overview image URL from Probe Library.
 * @param manufacturer Manufacturer to get probe from.
 * @param name Probe to get the overview image for.
 */
export function buildProbeOverviewImageSrc(
  manufacturer: string,
  name: string
): string {
  return new URL(
    `${manufacturer}/${name}/${name}.png`,
    FILE_API_BASE_URL
  ).toString();
}

/**
 * Parse and minimally validate an uploaded ProbeInterface file, returning
 * its first probe, or null if the file is invalid or missing required fields.
 * @param text Raw contents of a ProbeInterface JSON file.
 */
export function parseProbeInterfaceFile(
  text: string
): ProbeInterfaceProbe | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  return firstValidProbe(data);
}

/**
 * Extract the first valid probe from a ProbeInterface file's `probes` array.
 * @param data Value to read `probes` from.
 */
function firstValidProbe(data: unknown): ProbeInterfaceProbe | null {
  if (!isRecord(data)) return null;

  const { probes } = data;
  if (!Array.isArray(probes) || !probes[0]) return null;

  return isProbeInterfaceProbe(probes[0]) ? probes[0] : null;
}
