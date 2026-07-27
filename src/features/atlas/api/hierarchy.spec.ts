import { describe, expect, it } from "vitest";
import {
  buildHierarchy,
  getDefaultStructureIdentifiers,
  toTitleCase
} from "./hierarchy.api";
import {
  makeRelativePathTerminologyRows,
  makeTerminologyRow,
  makeTerminologyRows
} from "@/test/fixtures";

describe("buildHierarchy", () => {
  it("returns the root node with its own identifier, abbreviation, and color", () => {
    const node = buildHierarchy(makeTerminologyRows());

    expect(node?.identifier).toBe(997);
    expect(node?.abbreviation).toBe("root");
    expect(node?.color).toBe("#FFFFFF");
  });

  it("nests children by parent_identifier", () => {
    const node = buildHierarchy(makeTerminologyRows());

    expect(node?.children.map(c => c.identifier)).toEqual([8]);
    expect(node?.children[0]?.children.map(c => c.identifier)).toEqual([
      567, 700
    ]);
    expect(
      node?.children[0]?.children[0]?.children.map(c => c.identifier)
    ).toEqual([688]);
  });

  it("title-cases every node's name, including the root", () => {
    const node = buildHierarchy(makeTerminologyRows());

    expect(node?.name).toBe("Root");
    expect(node?.children[0]?.name).toBe("Basic Cell Groups And Regions");
  });

  it("passes color_hex_triplet through as color, not an rgb() string", () => {
    const node = buildHierarchy(makeTerminologyRows());

    expect(node?.children[0]?.color).toBe("#BFDAE3");
  });

  it("returns null for an empty list", () => {
    expect(buildHierarchy([])).toBeNull();
  });

  it("returns null when no row has a null parent_identifier", () => {
    const rows = makeTerminologyRows().map(row => ({
      ...row,
      parent_identifier: row.parent_identifier ?? 1
    }));

    expect(buildHierarchy(rows)).toBeNull();
  });

  it("skips a row whose parent_identifier references a missing id", () => {
    const rows = [
      ...makeTerminologyRows(),
      makeTerminologyRow({ identifier: 12345, parent_identifier: 99999 })
    ];

    const node = buildHierarchy(rows);

    const flatten = (n: NonNullable<typeof node>): number[] => [
      n.identifier,
      ...n.children.flatMap(flatten)
    ];
    expect(flatten(node!)).not.toContain(12345);
  });

  it("keeps children in input row order", () => {
    const node = buildHierarchy(makeTerminologyRows());

    expect(node?.children[0]?.children.map(c => c.identifier)).toEqual([
      567, 700
    ]);
  });

  // Regression: atlases like `african_molerat` author root_identifier_path
  // as relative [parent, self] pairs rather than full root-anchored paths.
  // buildHierarchy must not depend on root_identifier_path at all, or it
  // silently drops every row past the first level.
  it("places every row even when root_identifier_path is relative, not root-anchored", () => {
    const rows = makeRelativePathTerminologyRows();

    const node = buildHierarchy(rows);

    const flatten = (n: NonNullable<typeof node>): number[] => [
      n.identifier,
      ...n.children.flatMap(flatten)
    ];
    const numericSort = (a: number, b: number) => a - b;
    expect(flatten(node!).sort(numericSort)).toEqual(
      rows.map(r => r.identifier).sort(numericSort)
    );
  });
});

describe("getDefaultStructureIdentifiers", () => {
  it("returns the identifiers of root's direct children", () => {
    const result = getDefaultStructureIdentifiers(makeTerminologyRows());

    expect(result).toEqual([8]);
  });

  it("returns an empty list when no row has a null parent_identifier", () => {
    const rows = makeTerminologyRows().map(row => ({
      ...row,
      parent_identifier: row.parent_identifier ?? 1
    }));

    expect(getDefaultStructureIdentifiers(rows)).toEqual([]);
  });

  it("returns an empty list for an empty list", () => {
    expect(getDefaultStructureIdentifiers([])).toEqual([]);
  });
});

describe("toTitleCase", () => {
  it("title-cases a multi-word, mixed-case name", () => {
    expect(toTitleCase("basic cell GROUPS")).toBe("Basic Cell Groups");
  });

  it("title-cases a single word", () => {
    expect(toTitleCase("root")).toBe("Root");
  });

  it("returns an empty string unchanged", () => {
    expect(toTitleCase("")).toBe("");
  });
});
