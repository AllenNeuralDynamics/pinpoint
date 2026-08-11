import type { Manifest } from "./manifest.model";

/**
 * Identity of an atlas within its source. Both fields together are the
 * atlas's identity; `name` stays snake_case since it's what source URLs,
 * favorites and selection identity use.
 */
export interface AtlasIdentity {
  name: string;
  source: string;
}

/**
 * Atlas as listed by a source, before its manifest has been fetched.
 */
export interface AtlasListing extends AtlasIdentity {
  /** `atlases/`-relative `<directory>/<version>` paths of this atlas's size variants. */
  variantPaths: string[];
}

/**
 * Atlas identity paired with the aggregated manifest of its size variants.
 */
export interface Atlas extends AtlasIdentity {
  manifest: Manifest;
}
