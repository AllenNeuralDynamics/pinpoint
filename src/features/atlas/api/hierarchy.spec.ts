import { describe, expect, it } from "vitest";
import {
  atlasDisplayName,
  flattenHierarchy,
  getDefaultStructureIdentifiers,
  widestHierarchyRowWidth
} from "./hierarchy.api";
import type { HierarchyItem } from "./hierarchy.api";
import {
  makeAtlas,
  makeRelativePathTerminologyRows,
  makeTerminologyRow,
  makeTerminologyRows
} from "@/test/fixtures";
import { KNOWN_DEFAULT_STRUCTURES } from "../models/known-default-structures.model";

describe("flattenHierarchy", () => {
  it("flattens into DFS pre-order, excluding the root", () => {
    const items = flattenHierarchy(makeTerminologyRows());

    expect(items.map(i => i.identifier)).toEqual([8, 567, 688, 700]);
  });

  it("derives indent guides from each row's position in the tree", () => {
    const items = flattenHierarchy(makeTerminologyRows());
    const guidesFor = (identifier: number) =>
      items.find(i => i.identifier === identifier)?.guides;

    expect(guidesFor(8)).toEqual([]);
    expect(guidesFor(567)).toEqual(["tee"]);
    expect(guidesFor(688)).toEqual(["line", "elbow"]);
    expect(guidesFor(700)).toEqual(["elbow"]);
  });

  it("title-cases every row's name", () => {
    const items = flattenHierarchy(makeTerminologyRows());

    expect(items.find(i => i.identifier === 8)?.name).toBe(
      "Basic Cell Groups And Regions"
    );
  });

  it("passes color_hex_triplet through as color, not an rgb() string", () => {
    const items = flattenHierarchy(makeTerminologyRows());

    expect(items.find(i => i.identifier === 8)?.color).toBe("#BFDAE3");
  });

  it("returns an empty list for an empty list", () => {
    expect(flattenHierarchy([])).toEqual([]);
  });

  it("returns an empty list when no row has a null parent_identifier", () => {
    const rows = makeTerminologyRows().map(row => ({
      ...row,
      parent_identifier: row.parent_identifier ?? 1
    }));

    expect(flattenHierarchy(rows)).toEqual([]);
  });

  it("skips a row whose parent_identifier references a missing id", () => {
    const rows = [
      ...makeTerminologyRows(),
      makeTerminologyRow({ identifier: 12345, parent_identifier: 99999 })
    ];

    const items = flattenHierarchy(rows);

    expect(items.map(i => i.identifier)).not.toContain(12345);
  });

  it("keeps siblings in input row order", () => {
    const items = flattenHierarchy(makeTerminologyRows());

    expect(
      items
        .filter(i => [567, 700].includes(i.identifier))
        .map(i => i.identifier)
    ).toEqual([567, 700]);
  });

  // Regression: atlases like `african_molerat` author root_identifier_path
  // as relative [parent, self] pairs rather than full root-anchored paths.
  // flattenHierarchy must not depend on root_identifier_path at all, or it
  // silently drops every row past the first level.
  it("places every row even when root_identifier_path is relative, not root-anchored", () => {
    const rows = makeRelativePathTerminologyRows();

    const items = flattenHierarchy(rows);

    const rootRow = rows.find(r => r.parent_identifier === null)!;
    const expectedIdentifiers = rows
      .filter(r => r.identifier !== rootRow.identifier)
      .map(r => r.identifier);
    const numericSort = (a: number, b: number) => a - b;
    expect(items.map(i => i.identifier).sort(numericSort)).toEqual(
      expectedIdentifiers.sort(numericSort)
    );
  });
});

describe("getDefaultStructureIdentifiers", () => {
  it("returns the known default structures for an atlas with a known list", () => {
    const result = getDefaultStructureIdentifiers(
      makeAtlas({ name: "allen_mouse" }),
      makeTerminologyRows()
    );

    expect(result).toEqual(KNOWN_DEFAULT_STRUCTURES.allen_mouse);
  });

  it("ignores terminologyRows for an atlas with a known list", () => {
    const result = getDefaultStructureIdentifiers(
      makeAtlas({ name: "allen_mouse" }),
      []
    );

    expect(result).toEqual(KNOWN_DEFAULT_STRUCTURES.allen_mouse);
  });

  it("falls back to root's direct children for an atlas with no known list", () => {
    const result = getDefaultStructureIdentifiers(
      makeAtlas({ name: "african_molerat" }),
      makeTerminologyRows()
    );

    expect(result).toEqual([8]);
  });

  it("returns an empty list when no row has a null parent_identifier", () => {
    const rows = makeTerminologyRows().map(row => ({
      ...row,
      parent_identifier: row.parent_identifier ?? 1
    }));

    expect(
      getDefaultStructureIdentifiers(
        makeAtlas({ name: "african_molerat" }),
        rows
      )
    ).toEqual([]);
  });

  it("returns an empty list for an empty list", () => {
    expect(
      getDefaultStructureIdentifiers(makeAtlas({ name: "african_molerat" }), [])
    ).toEqual([]);
  });
});

describe("atlasDisplayName", () => {
  it("title-cases a multi-word snake_case name", () => {
    expect(atlasDisplayName("allen_mouse")).toBe("Allen Mouse");
  });

  it("uppercases known acronym tokens", () => {
    expect(atlasDisplayName("whs_sd_rat")).toBe("WHS SD Rat");
    expect(atlasDisplayName("perens_lsfm_mouse")).toBe("Perens LSFM Mouse");
  });

  it("title-cases a single word", () => {
    expect(atlasDisplayName("example")).toBe("Example");
  });

  it("returns an empty string unchanged", () => {
    expect(atlasDisplayName("")).toBe("");
  });
});

describe("widestHierarchyRowWidth", () => {
  function makeItem(overrides: Partial<HierarchyItem> = {}): HierarchyItem {
    return {
      identifier: 1,
      abbreviation: "AB",
      name: "Name",
      color: "#FFFFFF",
      guides: [],
      ...overrides
    };
  }

  const measure = (text: string, bold: boolean) => text.length * (bold ? 8 : 6);

  it("picks the widest row, not the deepest or the last", () => {
    const items = [
      makeItem({
        abbreviation: "A",
        name: "A",
        guides: ["line", "line", "line"]
      }),
      makeItem({ abbreviation: "AB", name: "A very long structure name" })
    ];

    expect(
      widestHierarchyRowWidth(
        items,
        { guideWidth: 16, chromeWidth: 56 },
        measure
      )
    ).toBe(258);
  });

  it("adds one guideWidth per guide", () => {
    const items = [
      makeItem({ abbreviation: "A", name: "A", guides: ["tee", "line"] })
    ];

    expect(
      widestHierarchyRowWidth(
        items,
        { guideWidth: 16, chromeWidth: 56 },
        measure
      )
    ).toBe(132);
  });

  it("excludes indent when guideWidth is 0", () => {
    const items = [
      makeItem({ abbreviation: "A", name: "A", guides: ["tee", "line"] })
    ];

    expect(
      widestHierarchyRowWidth(
        items,
        { guideWidth: 0, chromeWidth: 56 },
        measure
      )
    ).toBe(100);
  });

  it("returns 0 for an empty list", () => {
    expect(
      widestHierarchyRowWidth([], { guideWidth: 16, chromeWidth: 56 }, measure)
    ).toBe(0);
  });

  it("ceils each measurement separately", () => {
    const items = [makeItem()];

    expect(
      widestHierarchyRowWidth(
        items,
        { guideWidth: 0, chromeWidth: 0 },
        () => 10.2
      )
    ).toBe(73);
  });

  it("appends a margin of five average character widths", () => {
    const items = [makeItem({ abbreviation: "", name: "" })];

    expect(
      widestHierarchyRowWidth(items, { guideWidth: 0, chromeWidth: 0 }, measure)
    ).toBe(30);
  });
});
