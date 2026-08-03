import type { TerminologyRow } from "../models/terminology-row.model";
import type { Atlas } from "@/features/atlas";
import { KNOWN_DEFAULT_STRUCTURES } from "../models/known-default-structures.model";

/** One tree-indent cell: `line` (│), `blank`, `tee` (├), or `elbow` (└). */
export type HierarchyGuide = "line" | "blank" | "tee" | "elbow";

/**
 * Presentation-ready row of a DFS-flattened {@link TerminologyRow} hierarchy.
 */
export interface HierarchyItem {
  identifier: number;
  abbreviation: string;
  name: string;
  color: string;
  /** One cell per indent level, outermost first; `[]` for top-level rows. */
  guides: HierarchyGuide[];
}

/** Fixed pixel widths of a hierarchy row's non-text parts. */
export interface HierarchyRowMetrics {
  /** Width of one indent guide cell; 0 when guides are not rendered. */
  guideWidth: number;
  /** Combined width of the checkbox, colour icon, and their gutter gaps. */
  chromeWidth: number;
}

/** Breathing room appended to the widest row, in average character widths. */
const MARGIN_CHARACTERS = 5;

/** Atlas folder-name tokens that stay uppercase instead of being title-cased. */
const ACRONYMS = new Set([
  "whs", // Waxholm Space
  "sd", // Sprague Dawley
  "mpin", // Max Planck Institute of Neurobiology
  "admba", // Allen Developing Mouse Brain Atlas
  "lsfm", // light-sheet fluorescence microscopy
  "stp", // serial two-photon tomography
  "azba", // Adult Zebrafish Brain Atlas
  "unam", // Universidad Nacional Autónoma de México
  "sju", // Saint Joseph's University
  "mri" // magnetic resonance imaging
]);

/**
 * Convert an atlas's internal snake_case name into a display name, e.g.
 * `allen_mouse` -> `Allen Mouse`, uppercasing known {@link ACRONYMS}.
 * @param name Internal atlas name.
 */
export function atlasDisplayName(name: string): string {
  return name
    .split("_")
    .filter(Boolean)
    .map(word =>
      ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

/**
 * Flatten parsed terminology rows into a DFS pre-order list, linking each row
 * to its parent via `parent_identifier`. The root row itself is excluded.
 * @param terminologyRows Parsed terminology rows.
 */
export function flattenHierarchy(
  terminologyRows: TerminologyRow[]
): HierarchyItem[] {
  const rootRow = terminologyRows.find(row => row.parent_identifier === null);
  if (!rootRow) return [];

  const childrenByParent = new Map<number, TerminologyRow[]>();
  for (const row of terminologyRows) {
    if (row.parent_identifier === null) continue;
    const siblings = childrenByParent.get(row.parent_identifier) ?? [];
    siblings.push(row);
    childrenByParent.set(row.parent_identifier, siblings);
  }

  const items: HierarchyItem[] = [];
  const visited = new Set<number>([rootRow.identifier]);

  function visit(
    parentIdentifier: number,
    prefix: HierarchyGuide[],
    isTopLevel: boolean
  ): void {
    const children = childrenByParent.get(parentIdentifier) ?? [];
    children.forEach((row, index) => {
      if (visited.has(row.identifier)) return;
      visited.add(row.identifier);

      const isLast = index === children.length - 1;
      const guides: HierarchyGuide[] = isTopLevel
        ? []
        : [...prefix, isLast ? "elbow" : "tee"];
      items.push(toItem(row, guides));

      const childPrefix: HierarchyGuide[] = isTopLevel
        ? []
        : [...prefix, isLast ? "blank" : "line"];
      visit(row.identifier, childPrefix, false);
    });
  }

  visit(rootRow.identifier, [], true);
  return items;
}

/**
 * Widest rendered row width in pixels across every hierarchy item, plus a
 * {@link MARGIN_CHARACTERS}-wide margin, so a virtual scroller can be sized
 * from the whole list rather than its mounted rows.
 * @param items Hierarchy items to measure.
 * @param metrics Fixed pixel widths of a row's non-text parts.
 * @param measureText Measures a string's pixel width; `bold` selects the abbreviation's weight.
 */
export function widestHierarchyRowWidth(
  items: HierarchyItem[],
  metrics: HierarchyRowMetrics,
  measureText: (text: string, bold: boolean) => number
): number {
  if (items.length === 0) return 0;

  let widest = 0;
  for (const item of items) {
    // Ceil each string separately: canvas measurement runs up to ~0.015px
    // under the DOM's width, and a short result would re-clip the row.
    const width =
      item.guides.length * metrics.guideWidth +
      metrics.chromeWidth +
      Math.ceil(measureText(item.abbreviation, true)) +
      Math.ceil(measureText(item.name, false));
    if (width > widest) widest = width;
  }
  return widest + Math.ceil(measureText("0", false) * MARGIN_CHARACTERS);
}

/**
 * Build a {@link HierarchyItem} row from a terminology row.
 * @param terminologyRow Terminology row to convert.
 * @param guides Indent guides for this row, outermost first.
 */
function toItem(
  terminologyRow: TerminologyRow,
  guides: HierarchyGuide[]
): HierarchyItem {
  return {
    identifier: terminologyRow.identifier,
    abbreviation: terminologyRow.abbreviation,
    name: toTitleCase(terminologyRow.name),
    color: terminologyRow.color_hex_triplet,
    guides
  };
}

/**
 * Convert a terminology name to title case for display.
 * @param name Name to convert.
 */
function toTitleCase(name: string): string {
  return name
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Return the identifiers of the default structure for an atlas.
 *
 * Defaults to direct children of root if there are no known defaults.
 * @param atlas Atlas to get the default structure of.
 * @param terminologyRows Parsed terminology rows.
 */
export function getDefaultStructureIdentifiers(
  atlas: Atlas,
  terminologyRows: TerminologyRow[]
): number[] {
  const knownDefaults = KNOWN_DEFAULT_STRUCTURES[atlas.name];
  if (!knownDefaults) {
    const rootRow = terminologyRows.find(row => row.parent_identifier === null);
    if (!rootRow) return [];

    return terminologyRows
      .filter(row => row.parent_identifier === rootRow.identifier)
      .map(row => row.identifier);
  }

  return knownDefaults;
}
