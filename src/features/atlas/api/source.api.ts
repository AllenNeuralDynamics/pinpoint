import axios from "axios";
import Papa from "papaparse";
import { Color3 } from "@babylonjs/core";
import { isFiniteTriple, isRecord } from "@/utils/type-guards";
import type { Atlas, AtlasIdentity, AtlasListing } from "../models/atlas.model";
import type { Manifest } from "../models/manifest.model";
import type { TerminologyRow } from "../models/terminology-row.model";
import type { StructureEntity } from "../models/structure-entity.model";

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
 * `atlases/<atlas name>_<size>um/3_0/manifest.json`.
 */
interface RawManifest {
  name: string;
  resolution: [number, number, number];
  shape: [number, number, number];
  species?: string;
  terminology: { location: string };
  annotation_set: { location: string };
  atlas_link?: string;
}

/** Raw terminology row as parsed from CSV, before numeric/array fields are converted. */
type RawTerminologyRow = Record<keyof TerminologyRow, string>;

/** Identifier of a built-in S3-backed atlas source. */
export type BucketSourceId = "brainglobe" | "allenInstitute";

/**
 * Root URLs of the built-in S3-backed atlas sources, each ending in `/` so
 * source-root-relative manifest locations resolve against it.
 */
export const BUCKET_SOURCE_URLS: Record<BucketSourceId, string> = {
  brainglobe: "https://brainglobe.s3.us-west-2.amazonaws.com/atlas-rc2/",
  allenInstitute:
    "https://aind-scratch-data.s3.us-west-2.amazonaws.com/pinpoint-atlases/"
};

const ATLAS_VERSION_STRING = "3_0";

const ATLASES_DIRECTORY = "atlases";
const MANIFEST_FILE = "manifest.json";
const HTTP_SOURCE_PREFIX = "brainglobe-atlasapi";
const ANNOTATION_VOLUME_DIRECTORY = "annotations_compressed.ome.zarr";

/**
 * Allen Mouse atlas as bundled, so a new experiment has a usable atlas
 * before any network request completes.
 */
export const DEFAULT_ATLAS: Atlas = {
  name: "allen_mouse",
  source: BUCKET_SOURCE_URLS.brainglobe,
  manifest: {
    terminologyLocation: "/terminologies/allen_mouse-terminology/3_0",
    annotationSetLocation: "/annotation-sets/allen_mouse-annotation/3_0",
    species: "Mus musculus",
    atlasLink: "http://www.brain-map.org",
    resolutions: [
      [0.01, 0.01, 0.01],
      [0.025, 0.025, 0.025],
      [0.05, 0.05, 0.05],
      [0.1, 0.1, 0.1]
    ],
    shape: [
      [1320, 800, 1140],
      [528, 320, 456],
      [264, 160, 228],
      [132, 80, 114]
    ]
  }
};

/**
 * Fetch the list of atlases in an S3-backed atlases bucket, or null if
 * unreachable.
 * @param source Root URL of the atlas source.
 */
export async function listAtlasesBucket(
  source: string
): Promise<AtlasListing[] | null> {
  try {
    return atlasListingsFromDirectories(
      await listBucketAtlasDirectories(source),
      source
    );
  } catch {
    return null;
  }
}

/**
 * List the directory names directly under `atlases/` in an S3-backed
 * BrainGlobe bucket.
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
 * Group `atlases/` directory names into one listing per atlas, stripping the
 * resolution suffix, e.g. `allen_mouse_25um` -> `allen_mouse`.
 * @param directoryNames Directory names listed under `atlases/`.
 * @param source Root URL of the atlas source.
 */
function atlasListingsFromDirectories(
  directoryNames: string[],
  source: string
): AtlasListing[] {
  const listings = new Map<string, AtlasListing>();
  for (const directory of directoryNames.filter(Boolean)) {
    const index = directory.lastIndexOf("_");
    const name = index === -1 ? directory : directory.slice(0, index);
    const listing = listings.get(name);
    if (listing) listing.variantDirectories.push(directory);
    else listings.set(name, { name, source, variantDirectories: [directory] });
  }
  return [...listings.values()];
}

/**
 * Fetch the list of atlases in a BrainGlobe HTTP server's atlases directory,
 * or null if unreachable.
 * @param source Root URL of the BrainGlobe HTTP server.
 */
export async function listAtlasesHTTP(
  source: string
): Promise<AtlasListing[] | null> {
  try {
    const directoryNames = await listServerAtlasDirectories(source);
    return atlasListingsFromDirectories(directoryNames, source);
  } catch {
    return null;
  }
}

/**
 * List the folder names in the atlases directory of a BrainGlobe HTTP
 * server.
 * @param source Root URL of the BrainGlobe HTTP server.
 */
async function listServerAtlasDirectories(source: string): Promise<string[]> {
  const response = await axios.get<AtlasSourceResponse>(atlasesUrl(source));
  return response.data.files
    .filter(item => item.type === "folder")
    .map(item => item.name);
}

/**
 * Is a source one of the built-in buckets, which serve atlas paths at their
 * root, rather than an HTTP server that serves them under a path prefix.
 * @param source Root URL of the atlas source.
 */
function isBucketSource(source: string): boolean {
  return Object.values(BUCKET_SOURCE_URLS).includes(source);
}

/**
 * URL of a source's `atlases/` directory.
 * @param source Root URL of the atlas source.
 */
function atlasesUrl(source: string): string {
  return isBucketSource(source)
    ? new URL(ATLASES_DIRECTORY, source).toString()
    : `${source}/${HTTP_SOURCE_PREFIX}/${ATLASES_DIRECTORY}`;
}

/**
 * Fetch and parse an atlas's terminology list, or `[]` if unfetchable.
 * @param atlas Atlas to get the terminology list for.
 */
export async function getTerminologyRows(
  atlas: Atlas
): Promise<TerminologyRow[]> {
  return new Promise(resolve => {
    Papa.parse<RawTerminologyRow>(
      resolveSourcePath(
        atlas.source,
        `${atlas.manifest.terminologyLocation}/terminology.csv`
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
 * Convert a raw CSV row into a {@link TerminologyRow}, parsing the numeric
 * and array fields that PapaParse otherwise leaves as strings.
 * @param row Raw CSV row.
 */
function parseTerminologyRow(row: RawTerminologyRow): TerminologyRow {
  return {
    identifier: Number(row.identifier),
    parent_identifier:
      row.parent_identifier === "" ? null : Number(row.parent_identifier),
    annotation_value: Number(row.annotation_value),
    name: row.name,
    abbreviation: row.abbreviation,
    color_hex_triplet: row.color_hex_triplet
  };
}

/**
 * Do two atlas identities refer to the same atlas, comparing identity fields
 * since atlas objects are not stable references.
 * @param first First atlas identity to compare.
 * @param second Second atlas identity to compare.
 */
export function isSameAtlas(
  first: AtlasIdentity,
  second: AtlasIdentity
): boolean {
  return first.name === second.name && first.source === second.source;
}

/**
 * Are two atlases equal by value, manifest included, so an atlas object
 * replaced with an unchanged copy can be told apart from a real atlas change.
 * @param first First atlas to compare.
 * @param second Second atlas to compare.
 */
export function isEqualAtlas(first: Atlas, second: Atlas): boolean {
  const firstManifest = first.manifest;
  const secondManifest = second.manifest;
  return (
    isSameAtlas(first, second) &&
    firstManifest.terminologyLocation === secondManifest.terminologyLocation &&
    firstManifest.annotationSetLocation ===
      secondManifest.annotationSetLocation &&
    firstManifest.atlasLink === secondManifest.atlasLink &&
    isEqualTripleList(firstManifest.resolutions, secondManifest.resolutions) &&
    isEqualTripleList(firstManifest.shape, secondManifest.shape)
  );
}

/**
 * Are two lists of numeric triples equal element by element.
 * @param first First triple list to compare.
 * @param second Second triple list to compare.
 */
function isEqualTripleList(
  first: [number, number, number][],
  second: [number, number, number][]
): boolean {
  return (
    first.length === second.length &&
    first.every((triple, index) =>
      triple.every((value, axis) => value === second[index]![axis])
    )
  );
}

/**
 * Fetch and aggregate the manifests of an atlas's size variants, or null if
 * unreachable or without a usable finest variant.
 * @param listing Listing of the atlas to resolve.
 */
export async function getAtlas(listing: AtlasListing): Promise<Atlas | null> {
  try {
    const root = atlasesUrl(listing.source);
    const manifest = await buildManifest(
      listing.variantDirectories.map(
        directory =>
          `${root}/${directory}/${ATLAS_VERSION_STRING}/${MANIFEST_FILE}`
      )
    );
    return manifest
      ? { name: listing.name, source: listing.source, manifest }
      : null;
  } catch {
    return null;
  }
}

/**
 * Fetch every size variant's manifest file and aggregate them into a single
 * {@link Manifest}, ordered finest resolution first.
 * @param manifestUrls Manifest URLs, one per size variant directory.
 */
async function buildManifest(manifestUrls: string[]): Promise<Manifest | null> {
  if (manifestUrls.length === 0) return null;

  const responses = await Promise.all(
    manifestUrls.map(url => axios.get<RawManifest>(url))
  );

  const variants = responses
    .map(response => response.data)
    .sort((a, b) => Math.min(...a.resolution) - Math.min(...b.resolution));

  const finest = variants[0];
  if (!finest?.terminology?.location || !finest.annotation_set?.location) {
    return null;
  }

  return {
    terminologyLocation: finest.terminology.location,
    annotationSetLocation: finest.annotation_set.location,
    ...(finest.species && { species: finest.species }),
    atlasLink: finest.atlas_link || null,
    resolutions: variants.map(variant => {
      const [ap, dv, ml] = variant.resolution;
      return [ap / 1000, dv / 1000, ml / 1000];
    }),
    shape: variants.map(variant => variant.shape)
  };
}

/**
 * Check that a value has the shape of an `Atlas`, manifest included.
 * @param value Value to check.
 */
export function isAtlas(value: unknown): value is Atlas {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string" || typeof value.source !== "string") {
    return false;
  }

  const { manifest } = value;
  return (
    isRecord(manifest) &&
    typeof manifest.terminologyLocation === "string" &&
    typeof manifest.annotationSetLocation === "string" &&
    (manifest.atlasLink === null || typeof manifest.atlasLink === "string") &&
    Array.isArray(manifest.resolutions) &&
    manifest.resolutions.every(isFiniteTriple) &&
    Array.isArray(manifest.shape) &&
    manifest.shape.every(isFiniteTriple)
  );
}

/**
 * Resolve the structure entities for a list of identifiers, dropping any
 * that don't resolve.
 * @param atlas Atlas to pull mesh info from.
 * @param terminologyRows Parsed terminology rows for the atlas.
 * @param identifiers Structure identifiers to build for.
 */
export function structureEntitiesFromIdentifiers(
  atlas: Atlas,
  terminologyRows: TerminologyRow[],
  identifiers: number[]
): StructureEntity[] {
  const rowsByIdentifier = new Map(
    terminologyRows.map(row => [row.identifier, row])
  );
  const entities: StructureEntity[] = [];
  for (const identifier of identifiers) {
    const row = rowsByIdentifier.get(identifier);
    if (row) entities.push(structureEntityFromRow(atlas, row));
  }
  return entities;
}

/**
 * Build a structure entity from a terminology row.
 * @param atlas Atlas to pull mesh info from.
 * @param terminologyRow Terminology row to build the entity from.
 */
function structureEntityFromRow(
  atlas: Atlas,
  terminologyRow: TerminologyRow
): StructureEntity {
  return {
    identifier: terminologyRow.identifier,
    meshPath: resolveSourcePath(
      atlas.source,
      `${atlas.manifest.annotationSetLocation}/annotations.precomputed/mesh/${terminologyRow.identifier}`
    ),
    color: Color3.FromHexString(terminologyRow.color_hex_triplet)
  };
}

/**
 * Absolute URL of an atlas's uint32 annotation volume (OME-Zarr root).
 * @param atlas Atlas to locate the volume for.
 */
export function getAnnotationVolumeUrl(atlas: Atlas): string {
  return resolveSourcePath(
    atlas.source,
    `${atlas.manifest.annotationSetLocation}/${ANNOTATION_VOLUME_DIRECTORY}`
  );
}

/**
 * Resolve a manifest's source-root-relative location against an atlas source.
 * @param source Root URL of the atlas source.
 * @param path Source-root-relative path, starting with `/`.
 */
function resolveSourcePath(source: string, path: string): string {
  return isBucketSource(source)
    ? new URL(path.replace(/^\//, ""), source).toString()
    : `${source}/${HTTP_SOURCE_PREFIX}${path}`;
}

/**
 * Compute the atlas volume's extent along each ASR axis, in mm, or all zeros
 * if unknown.
 * @param atlas Atlas to compute the dimensions for.
 */
export function getAtlasDimensionsMillimeters(
  atlas: Atlas
): [number, number, number] {
  if (!atlas.manifest.resolutions[0] || !atlas.manifest.shape[0]) {
    return [0, 0, 0];
  }

  const [apResolution, dvResolution, mlResolution] =
    atlas.manifest.resolutions[0];
  const [apShape, dvShape, mlShape] = atlas.manifest.shape[0];
  return [
    apResolution * apShape,
    dvResolution * dvShape,
    mlResolution * mlShape
  ];
}

/**
 * Computes the center of the atlas volume in mm.
 * @param atlas Atlas to compute the center for.
 */
export function getAtlasCenter(atlas: Atlas): [number, number, number] {
  const [ap, dv, ml] = getAtlasDimensionsMillimeters(atlas);
  return [ap / 2, dv / 2, ml / 2];
}

/**
 * Compute the longest edge of the atlas volume's bounding box, in mm, or 0
 * if unknown.
 * @param atlas Atlas to compute the longest dimension for.
 */
export function getAtlasLongestDimensionMillimeters(atlas: Atlas): number {
  return Math.max(...getAtlasDimensionsMillimeters(atlas));
}
