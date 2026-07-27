import axios from "axios";
import Papa from "papaparse";
import { Color3 } from "@babylonjs/core";
import { StructureEntity } from "@/features/scene";
import { Atlas } from "../models/atlas.model";
import { Manifest } from "../models/manifest.model";
import { TerminologyRow } from "../models/terminology-row.model";

/**
 * Atlas item in an atlas source's response structure.
 */
interface AtlasItem {
  name: string;
  type: string;
}

/**
 * Atlas source connection response.
 */
interface AtlasSourceResponse {
  files: AtlasItem[];
}

/**
 * Manifest of a single size variant of an atlas, as stored at
 * `atlases/<atlas name>_<size>um/3_0/manifest.json`. Only the fields used to
 * build a {@link Manifest} are described here.
 */
interface RawManifest {
  name: string;
  resolution: [number, number, number];
  shape: [number, number, number];
  terminology: { location: string };
  annotation_set: { location: string };
}

/**
 * Raw terminology row as parsed from CSV, before numeric/array fields are
 * converted from their string representation.
 */
type RawTerminologyRow = Record<keyof TerminologyRow, string>;

export const BRAINGLOBE_BASE_URL =
  "https://brainglobe.s3.us-west-2.amazonaws.com/atlas-rc2/";
const ATLAS_VERSION_STRING = "3_0";

const ATLASES_DIRECTORY = "atlases";
const MANIFEST_FILE = "manifest.json";
const HTTP_SOURCE_PREFIX = "brainglobe-atlasapi";

/**
 * Fallback value if an atlas center coordinate can't be determined.
 */
const FALLBACK_ATLAS_CENTER: [number, number, number] = [0, 0, 0];

/**
 * Fetch and parse the list of atlases available in the BrainGlobe atlases
 * bucket.
 * @returns The parsed atlases, or null if the bucket couldn't be reached.
 */
export async function listAtlases(): Promise<Atlas[] | null> {
  try {
    const directoryNames =
      await listBucketAtlasDirectories(BRAINGLOBE_BASE_URL);
    return atlasNamesFromDirectories(directoryNames).map(name => ({
      name,
      source: BRAINGLOBE_BASE_URL
    }));
  } catch {
    return null;
  }
}

/**
 * Fetch and parse the list of atlases available in the atlases directory of
 * a BrainGlobe HTTP server.
 * @param source Root URL of the BrainGlobe HTTP server.
 * @returns The parsed atlases, or null if the host couldn't be reached.
 */
export async function listAtlasesHTTP(source: string): Promise<Atlas[] | null> {
  try {
    const directoryNames = await listServerAtlasDirectories(
      `${source}/${HTTP_SOURCE_PREFIX}/${ATLASES_DIRECTORY}`
    );
    return atlasNamesFromDirectories(directoryNames).map(name => ({
      name,
      source
    }));
  } catch {
    return null;
  }
}

/**
 * Fetch and parse the terminology list for an atlas.
 * @param manifest Manifest of the atlas to get the terminology list for and
 * parse.
 * @returns Parsed terminology list, or an empty list if it couldn't be
 * fetched or parsed.
 */
export async function getTerminologyRows(
  manifest: Manifest
): Promise<TerminologyRow[]> {
  return new Promise(resolve => {
    Papa.parse<RawTerminologyRow>(
      resolveSourcePath(
        manifest.atlas.source,
        `${manifest.terminologyLocation}/terminology.csv`
      ),
      {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: results => {
          if (results.errors.length > 0) {
            resolve([]);
            return;
          }

          resolve(results.data.map(parseTerminologyRow));
        },
        error: () => resolve([])
      }
    );
  });
}

/**
 * Fetch and aggregate the manifests of every size variant of an atlas,
 * discovering the atlases directory either via an S3-backed BrainGlobe
 * bucket's prefix listing or a BrainGlobe HTTP server's directory listing,
 * depending on whether `atlas.source` is the BrainGlobe bucket.
 * @param atlas Atlas to build the aggregated manifest for.
 * @returns The aggregated manifest, or null if the source couldn't be
 * reached or the atlas has no size variants there.
 */
export async function getManifest(atlas: Atlas): Promise<Manifest | null> {
  try {
    const isBrainGlobe = atlas.source === BRAINGLOBE_BASE_URL;

    const atlasesUrl = isBrainGlobe
      ? new URL(ATLASES_DIRECTORY, atlas.source).toString()
      : `${atlas.source}/${HTTP_SOURCE_PREFIX}/${ATLASES_DIRECTORY}`;

    const directoryNames = isBrainGlobe
      ? await listBucketAtlasDirectories(atlas.source)
      : await listServerAtlasDirectories(atlasesUrl);

    return await buildManifest(
      atlas,
      sizeVariantDirectories(directoryNames, atlas).map(
        directory =>
          `${atlasesUrl}/${directory}/${ATLAS_VERSION_STRING}/${MANIFEST_FILE}`
      )
    );
  } catch {
    return null;
  }
}

/**
 * Returns a structure entity for a structure by identifier from an atlas's
 * manifest and its parsed terminology row.
 * @param manifest Manifest of the atlas to pull mesh info from.
 * @param terminologyRows Parsed terminology rows for the atlas.
 * @param identifier Structure identifier to build for.
 */
export function structureEntityFromIdentifier(
  manifest: Manifest,
  terminologyRows: TerminologyRow[],
  identifier: number
): StructureEntity | null {
  const terminologyRow = terminologyRows.find(
    row => row.identifier === identifier
  );
  if (!terminologyRow) return null;

  return {
    identifier: terminologyRow.identifier,
    meshPath: resolveSourcePath(
      manifest.atlas.source,
      `${manifest.annotationSetLocation}/annotations.precomputed/mesh/${terminologyRow.identifier}`
    ),
    color: Color3.FromHexString(terminologyRow.color_hex_triplet)
  };
}

/**
 * Computes the center of the atlas volume in mm.
 * @param manifest Atlas manifest to compute the center for.
 */
export function getAtlasCenter(manifest: Manifest): [number, number, number] {
  // If the atlas doesn't have resolution or shape, use 0, 0, 0.
  if (!manifest.resolutions[0] || !manifest.shape[0])
    return FALLBACK_ATLAS_CENTER;

  // Otherwise, compute the center
  const [apResolution, dvResolution, mlResolution] = manifest.resolutions[0];
  const [apShape, dvShape, mlShape] = manifest.shape[0];
  return [
    (apResolution * apShape) / 2,
    (dvResolution * dvShape) / 2,
    (mlResolution * mlShape) / 2
  ];
}

/**
 * Convert a raw CSV row into a {@link TerminologyRow}, parsing the numeric
 * and array fields that PapaParse otherwise leaves as strings.
 * @param row Raw CSV row.
 */
function parseTerminologyRow(row: RawTerminologyRow): TerminologyRow {
  let rootIdentifierPath: number[];
  try {
    rootIdentifierPath = JSON.parse(row.root_identifier_path) as number[];
  } catch {
    rootIdentifierPath = [];
  }

  return {
    identifier: Number(row.identifier),
    parent_identifier:
      row.parent_identifier === "" ? null : Number(row.parent_identifier),
    annotation_value: Number(row.annotation_value),
    name: row.name,
    abbreviation: row.abbreviation,
    color_hex_triplet: row.color_hex_triplet,
    root_identifier_path: rootIdentifierPath
  };
}

/**
 * Derive the unique atlas names from a list of `atlases/` directory names,
 * by slicing off the resolution suffix (everything after the last
 * underscore), e.g. `allen_mouse_25um` -> `allen_mouse`. Multiple size
 * variants of the same atlas collapse to one name.
 * @param directoryNames Directory names listed under `atlases/`.
 */
function atlasNamesFromDirectories(directoryNames: string[]): string[] {
  return [
    ...new Set(
      directoryNames.filter(Boolean).map(name => {
        const index = name.lastIndexOf("_");
        return index === -1 ? name : name.slice(0, index);
      })
    )
  ];
}

/**
 * Resolve a manifest's source-root-relative location (e.g.
 * `/terminologies/allen_mouse-terminology/3_0`) against an atlas source,
 * using the same BrainGlobe-bucket-vs-HTTP-server branching as
 * {@link getManifest}.
 * @param source Root URL of the atlas source.
 * @param path Source-root-relative path, starting with `/`.
 */
function resolveSourcePath(source: string, path: string): string {
  return source === BRAINGLOBE_BASE_URL
    ? new URL(path.replace(/^\//, ""), source).toString()
    : `${source}/${HTTP_SOURCE_PREFIX}${path}`;
}

/**
 * List the directory names directly under `atlases/` in an S3-backed
 * BrainGlobe bucket, via a delimited prefix listing.
 * @param source Root URL of the bucket.
 */
async function listBucketAtlasDirectories(source: string): Promise<string[]> {
  const bucket = new URL(source);
  const params = new URLSearchParams({
    "list-type": "2",
    prefix: `${bucket.pathname.slice(1)}${ATLASES_DIRECTORY}/`,
    delimiter: "/"
  });

  const response = await axios.get<string>(`${bucket.origin}/?${params}`, {
    responseType: "text"
  });

  const doc = new DOMParser().parseFromString(response.data, "application/xml");
  return Array.from(doc.getElementsByTagName("CommonPrefixes"))
    .map(el => el.getElementsByTagName("Prefix")[0]?.textContent ?? "")
    .map(prefix => prefix.split("/").filter(Boolean).pop() ?? "");
}

/**
 * List the folder names in the atlases directory of a BrainGlobe HTTP
 * server.
 * @param atlasesUrl URL of the server's atlases directory.
 */
async function listServerAtlasDirectories(
  atlasesUrl: string
): Promise<string[]> {
  const response = await axios.get<AtlasSourceResponse>(atlasesUrl);
  return response.data.files
    .filter(item => item.type === "folder")
    .map(item => item.name);
}

/**
 * Keep only the directory names under `atlases/` that are size variants of
 * the given atlas, i.e. `<atlas name>_<size>um`. Sibling atlases that merely
 * share the prefix (e.g. `allen_mouse_bluebrain_barrels_10um` for
 * `allen_mouse`) keep an underscore once the prefix is stripped, so they're
 * dropped.
 * @param directoryNames Directory names listed under `atlases/`.
 * @param atlas Atlas whose size variants to keep.
 */
function sizeVariantDirectories(
  directoryNames: string[],
  atlas: Atlas
): string[] {
  const prefix = `${atlas.name}_`;
  return directoryNames.filter(
    name => name.startsWith(prefix) && !name.slice(prefix.length).includes("_")
  );
}

/**
 * Fetch every size variant's manifest file and aggregate them into a single
 * {@link Manifest}, ordered finest resolution first and index-aligned so
 * that `resolutions[i]` and `shape[i]` come from the same variant.
 *
 * Rejects if any manifest can't be fetched, leaving the caller's `catch` to
 * turn that into null.
 * @param atlas Atlas the size variants belong to.
 * @param manifestUrls Manifest URLs, one per size variant directory.
 * @returns The aggregated manifest, or null if the atlas has no size
 * variants in the source.
 */
async function buildManifest(
  atlas: Atlas,
  manifestUrls: string[]
): Promise<Manifest | null> {
  if (manifestUrls.length === 0) return null;

  const responses = await Promise.all(
    manifestUrls.map(url => axios.get<RawManifest>(url))
  );

  const variants = responses
    .map(response => response.data)
    .sort((a, b) => Math.min(...a.resolution) - Math.min(...b.resolution));

  // All size variants of an atlas share the same terminology and annotation
  // set, so the finest variant's locations apply to the whole manifest.
  const finest = variants[0];
  if (!finest?.terminology?.location || !finest.annotation_set?.location) {
    return null;
  }

  return {
    atlas,
    terminologyLocation: finest.terminology.location,
    annotationSetLocation: finest.annotation_set.location,
    resolutions: variants.map(variant => {
      // Convert um to mm.
      const [ap, dv, ml] = variant.resolution;
      return [ap / 1000, dv / 1000, ml / 1000];
    }),
    shape: variants.map(variant => variant.shape)
  };
}
