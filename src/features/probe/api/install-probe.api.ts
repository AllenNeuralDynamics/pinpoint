import axios from "axios";
import {
  ProbeInterfaceFile,
  ProbeInterfaceProbe
} from "../models/probe-interface.model";

interface GitHubItem {
  name: string;
  type: string;
}
interface GitHub404 {
  status: string;
}
type GitHubItemResponse = GitHubItem[] | GitHub404;

/**
 * Fetch URL for GitHub repository contents.
 */
const githubApi = axios.create({
  baseURL:
    "https://api.github.com/repos/SpikeInterface/probeinterface_library/contents",
  headers: {
    Accept: "application/vnd.github+json"
  }
});

const FILE_API_BASE_URL =
  "https://raw.githubusercontent.com/SpikeInterface/probeinterface_library/main/";

/**
 * Fetch URL for the contents of a file in GitHub.
 */
const fileApi = axios.create({
  baseURL: FILE_API_BASE_URL
});

/**
 * Return the list of probe vendors.
 *
 * Computed as the top level non-scripting folders.
 */
export async function getVendors(): Promise<string[]> {
  try {
    const { data } = await githubApi.get<GitHubItemResponse>("/");

    // Exit if we can't find vendors.
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
 * Return the list of probes by the vendor.
 *
 * Computed as the names of directories in a vendor folder.
 *
 * @param vendor Vendor to get probes from.
 */
export async function getProbeNames(vendor: string): Promise<string[]> {
  try {
    const { data } = await githubApi.get<GitHubItemResponse>(`/${vendor}`);

    // Exit if we can't find any probes.
    if (!data || isGitHub404(data)) return [];

    return data.filter(item => item.type === "dir").map(item => item.name);
  } catch {
    return [];
  }
}

/**
 * Return a probe's ProbeInterface specification.
 *
 * Returns null if there are problems getting the spec.
 *
 * @remarks Will currently only extract the first probe in a ProbeInterface file.
 *
 * @param vendor Vendor to get probe from.
 * @param name Probe from vendor.
 */
export async function getProbeInterfaceProbe(
  vendor: string,
  name: string
): Promise<ProbeInterfaceProbe | null> {
  try {
    const { data } = await fileApi.get<ProbeInterfaceFile>(
      `/${vendor}/${name}/${name}.json`
    );

    // Exit if we can't find the probe.
    if (!data) return null;

    // Exit if no probes exist.
    if (!data.probes[0]) return null;

    // Extract first one.
    return data.probes[0];
  } catch {
    return null;
  }
}

/**
 * Return a probe overview image URL from Probe Library.
 * @param vendor Vendor to get probe from.
 * @param name Probe to get the overview image for.
 */
export function buildProbeOverviewImageSrc(
  vendor: string,
  name: string
): string {
  return new URL(`${vendor}/${name}/${name}.png`, FILE_API_BASE_URL).toString();
}

/**
 * Parse and minimally validate a ProbeInterface file's contents, returning
 * its first probe.
 *
 * This is meant for user uploaded files.
 *
 * @remarks Mirrors {@link getProbeInterfaceProbe}, which also only extracts
 * the first probe in a ProbeInterface file. Returns null if the text isn't
 * valid JSON, has no probes, or its first probe is missing required fields.
 *
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

  if (!data || typeof data !== "object") return null;

  const { probes } = data as Record<string, unknown>;
  if (!Array.isArray(probes) || !probes[0]) return null;

  return isProbeInterfaceProbe(probes[0]) ? probes[0] : null;
}

/**
 * Check if a GitHub response was a 404 message.
 * @param response response data from a GitHub content fetch.
 */
function isGitHub404(response: GitHubItemResponse): response is GitHub404 {
  return !Array.isArray(response) && response.status === "404";
}

/**
 * Check that a value has the minimal shape of a ProbeInterface probe.
 * @param value Value to check.
 */
function isProbeInterfaceProbe(value: unknown): value is ProbeInterfaceProbe {
  if (!value || typeof value !== "object") return false;

  const probe = value as Record<string, unknown>;
  if (
    typeof probe.ndim !== "number" ||
    typeof probe.si_units !== "string" ||
    !Array.isArray(probe.contact_positions)
  ) {
    return false;
  }

  if (!probe.annotations || typeof probe.annotations !== "object") {
    return false;
  }

  const annotations = probe.annotations as Record<string, unknown>;
  return (
    typeof annotations.model_name === "string" &&
    typeof annotations.manufacturer === "string"
  );
}
