import { TerminologyRow } from "../models/terminology-row.model";

/**
 * Presentation-ready tree node built from a {@link TerminologyRow}.
 */
export interface HierarchyModel {
  identifier: number;
  abbreviation: string;
  name: string;
  color: string;
  children: HierarchyModel[];
}

/**
 * Convert a terminology name to title case for display.
 * @param name Name to convert.
 */
export function toTitleCase(name: string): string {
  return name
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Build a tree hierarchy from parsed terminology rows, linking each row to
 * its parent via `parent_identifier`.
 *
 * `root_identifier_path` isn't used here: it's not reliably root-anchored
 * across atlases (some author it as relative `[parent, self]` pairs), so
 * relying on it silently drops rows for those atlases.
 * @param terminologyRows Parsed terminology rows.
 */
export function buildHierarchy(
  terminologyRows: TerminologyRow[]
): HierarchyModel | null {
  const rootRow = terminologyRows.find(row => row.parent_identifier === null);
  if (!rootRow) return null;

  const nodesByIdentifier = new Map(
    terminologyRows.map(row => [row.identifier, toNode(row)])
  );

  for (const row of terminologyRows) {
    if (row.parent_identifier === null) continue;
    nodesByIdentifier
      .get(row.parent_identifier)
      ?.children.push(nodesByIdentifier.get(row.identifier)!);
  }

  return nodesByIdentifier.get(rootRow.identifier) ?? null;
}

/**
 * Return the identifiers of the default structures.
 *
 * Currently, this is the identifiers of the direct children of root.
 *
 * @param terminologyRows Parsed terminology rows.
 */
export function getDefaultStructureIdentifiers(
  terminologyRows: TerminologyRow[]
): number[] {
  const rootRow = terminologyRows.find(row => row.parent_identifier === null);
  if (!rootRow) return [];

  return terminologyRows
    .filter(row => row.parent_identifier === rootRow.identifier)
    .map(row => row.identifier);
}

/**
 * Build a {@link HierarchyModel} node from a terminology row.
 * @param terminologyRow Terminology row to convert.
 */
function toNode(terminologyRow: TerminologyRow): HierarchyModel {
  return {
    identifier: terminologyRow.identifier,
    abbreviation: terminologyRow.abbreviation,
    name: toTitleCase(terminologyRow.name),
    color: terminologyRow.color_hex_triplet,
    children: []
  };
}
