import parse from "semver/functions/parse";

/** How a loaded file's Pinpoint version relates to the running one. */
export type VersionRelation =
  | "match"
  | "unknown"
  | "majorBehind"
  | "minorBehind"
  | "majorAhead"
  | "minorAhead";

/**
 * Compare a loaded file's Pinpoint version to the running one, ignoring patch
 * and prerelease differences.
 * @param version Version recorded in the file.
 * @param appVersion Running Pinpoint version.
 */
export function compareFileVersion(
  version: string,
  appVersion: string
): VersionRelation {
  const fileSemver = parse(version);
  const appSemver = parse(appVersion);
  if (!fileSemver || !appSemver) return "unknown";

  if (fileSemver.major !== appSemver.major) {
    return fileSemver.major < appSemver.major ? "majorBehind" : "majorAhead";
  }
  if (fileSemver.minor !== appSemver.minor) {
    return fileSemver.minor < appSemver.minor ? "minorBehind" : "minorAhead";
  }
  return "match";
}
