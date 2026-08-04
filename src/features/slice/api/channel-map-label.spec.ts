import { describe, expect, it } from "vitest";
import type { ProbeShank } from "@/features/probe";
import type { SampleResult } from "../models/sample-result.model";
import {
  getChannelMapLabels,
  getChannelMapTooltipPosition,
  getChannelMapWidths,
  getStructureLabelRuns
} from "./channel-map-label.api";

/**
 * Build a fixture shank with just the width `getChannelMapWidths` reads.
 * @param widthMillimeters Full x extent of the shank's outline, in mm.
 */
function makeShank(widthMillimeters: number): ProbeShank {
  return {
    id: null,
    rings: [],
    contacts: [],
    minimumXMillimeters: 0,
    maximumXMillimeters: widthMillimeters,
    widthMillimeters
  };
}

/**
 * Build a fixture sample result from a row-major annotation value grid.
 * @param widthPixels Edge length along u, in pixels.
 * @param heightPixels Edge length along v, in pixels.
 * @param annotationValues Row-major annotation values, one per sample.
 */
function makeSampleResult(
  widthPixels: number,
  heightPixels: number,
  annotationValues: number[] = []
): SampleResult {
  const values = new Uint32Array(widthPixels * heightPixels);
  values.set(annotationValues);
  const pixels = new Uint8ClampedArray(widthPixels * heightPixels * 4);
  return {
    widthPixels,
    heightPixels,
    annotationValues: values,
    pixels,
    packedPixels: new Uint32Array(pixels.buffer),
    imageData: new ImageData(
      pixels,
      Math.max(widthPixels, 1),
      Math.max(heightPixels, 1)
    ),
    paintedChunkCount: 1,
    totalChunkCount: 1
  };
}

describe("getChannelMapWidths", () => {
  it("sizes the gutter one and a half times as wide as equal-width shanks", () => {
    const widths = getChannelMapWidths([makeShank(0.1), makeShank(0.1)]);

    expect(widths.shankMillimeters).toBe(0.2);
    expect(widths.gutterMillimeters).toBeCloseTo(0.15);
    expect(widths.imageFraction).toBeCloseTo(0.2 / 0.35);
  });

  it("sizes the gutter off the widest shank when shanks differ", () => {
    const widths = getChannelMapWidths([makeShank(0.05), makeShank(0.2)]);

    expect(widths.shankMillimeters).toBeCloseTo(0.25);
    expect(widths.gutterMillimeters).toBeCloseTo(0.3);
  });

  it("returns an un-gutted, full-width split for an empty shank array", () => {
    expect(getChannelMapWidths([])).toEqual({
      shankMillimeters: 0,
      gutterMillimeters: 0,
      imageFraction: 1
    });
  });
});

describe("getStructureLabelRuns", () => {
  it("centers a single-column run on its vertical midpoint", () => {
    const annotationValues = Array.from({ length: 8 }, () => 0);
    for (let row = 2; row <= 5; row++) annotationValues[row] = 9;

    const runs = getStructureLabelRuns(
      makeSampleResult(1, 8, annotationValues)
    );

    expect(runs).toEqual([
      { annotationValue: 9, centerFraction: 0.5, areaPixels: 4 }
    ]);
  });

  it("unions a value across shank columns in the same row into one run", () => {
    // 2 columns x 4 rows; value 5 occupies column 0 on row 0 and column 1 on row 1.
    const annotationValues = [5, 0, 0, 5, 0, 0, 0, 0];

    const runs = getStructureLabelRuns(
      makeSampleResult(2, 4, annotationValues)
    );

    expect(runs).toEqual([
      { annotationValue: 5, centerFraction: 0.25, areaPixels: 2 }
    ]);
  });

  it("splits a run interrupted by a gap row into two runs with distinct centres", () => {
    // 1 column x 5 rows; value 3 on rows 0-1, absent on row 2, present on rows 3-4.
    const annotationValues = [3, 3, 0, 3, 3];

    const runs = getStructureLabelRuns(
      makeSampleResult(1, 5, annotationValues)
    );

    expect(runs).toEqual([
      { annotationValue: 3, centerFraction: 0.2, areaPixels: 2 },
      { annotationValue: 3, centerFraction: 0.8, areaPixels: 2 }
    ]);
  });

  it("flushes a run that reaches the last row", () => {
    const annotationValues = [0, 7, 7, 7];

    const runs = getStructureLabelRuns(
      makeSampleResult(1, 4, annotationValues)
    );

    expect(runs).toEqual([
      { annotationValue: 7, centerFraction: 0.625, areaPixels: 3 }
    ]);
  });

  it("counts every shank column a row contributes to a run's area", () => {
    // 2 columns x 2 rows; value 4 fills both columns of row 0 only.
    const runs = getStructureLabelRuns(makeSampleResult(2, 2, [4, 4, 0, 0]));

    expect(runs).toEqual([
      { annotationValue: 4, centerFraction: 0.25, areaPixels: 2 }
    ]);
  });

  it("returns no runs for an all-zero image", () => {
    expect(getStructureLabelRuns(makeSampleResult(3, 3)).length).toBe(0);
  });

  it("returns no runs for a 0x0 result", () => {
    expect(getStructureLabelRuns(makeSampleResult(0, 0)).length).toBe(0);
  });
});

describe("getChannelMapLabels", () => {
  const gutterHeightPixels = 600;
  const lineHeightPixels = 12;
  const structures = new Map([
    [9, { abbreviation: "A" }],
    [8, { abbreviation: "B" }],
    [7, { abbreviation: "C" }]
  ]);

  it("keeps only the larger-area run when one structure repeats nearby", () => {
    const labels = getChannelMapLabels(
      [
        { annotationValue: 9, centerFraction: 0.5, areaPixels: 4 },
        { annotationValue: 9, centerFraction: 0.52, areaPixels: 40 }
      ],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels).toEqual([
      { key: "9-0.52", abbreviation: "A", topPixels: 306 }
    ]);
  });

  it("keeps only the larger-area structure when two structures crowd each other", () => {
    const labels = getChannelMapLabels(
      [
        { annotationValue: 9, centerFraction: 0.5, areaPixels: 4 },
        { annotationValue: 8, centerFraction: 0.505, areaPixels: 100 }
      ],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels).toEqual([
      { key: "8-0.505", abbreviation: "B", topPixels: 297 }
    ]);
  });

  it("keeps both labels exactly two line heights apart", () => {
    const labels = getChannelMapLabels(
      [
        { annotationValue: 9, centerFraction: 0.5, areaPixels: 5 },
        { annotationValue: 8, centerFraction: 0.54, areaPixels: 5 }
      ],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels).toEqual([
      { key: "9-0.5", abbreviation: "A", topPixels: 294 },
      { key: "8-0.54", abbreviation: "B", topPixels: 318 }
    ]);
  });

  it("drops a label just inside two line heights of a larger one", () => {
    const labels = getChannelMapLabels(
      [
        { annotationValue: 9, centerFraction: 0.5, areaPixels: 5 },
        { annotationValue: 8, centerFraction: 0.53, areaPixels: 50 }
      ],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels).toEqual([
      { key: "8-0.53", abbreviation: "B", topPixels: 312 }
    ]);
  });

  it("orders surviving labels top-down regardless of area or scan order", () => {
    const labels = getChannelMapLabels(
      [
        { annotationValue: 9, centerFraction: 0.9, areaPixels: 100 },
        { annotationValue: 8, centerFraction: 0.1, areaPixels: 5 }
      ],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels.map(label => label.abbreviation)).toEqual(["B", "A"]);
    expect(labels.map(label => label.topPixels)).toEqual([54, 534]);
  });

  it("lets one large run suppress crowded neighbours on both sides", () => {
    const labels = getChannelMapLabels(
      [
        { annotationValue: 9, centerFraction: 0.1, areaPixels: 5 },
        { annotationValue: 8, centerFraction: 0.12, areaPixels: 50 },
        { annotationValue: 7, centerFraction: 0.14, areaPixels: 5 }
      ],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels).toEqual([
      { key: "8-0.12", abbreviation: "B", topPixels: 66 }
    ]);
  });

  it("measures the exclusion gap from kept labels, not from dropped ones", () => {
    const labels = getChannelMapLabels(
      [
        { annotationValue: 9, centerFraction: 0, areaPixels: 100 },
        { annotationValue: 8, centerFraction: 0.02, areaPixels: 5 },
        { annotationValue: 7, centerFraction: 0.05, areaPixels: 5 }
      ],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels).toEqual([
      { key: "9-0", abbreviation: "A", topPixels: 0 },
      { key: "7-0.05", abbreviation: "C", topPixels: 24 }
    ]);
  });

  it("resolves conflicts the top and bottom clamps create", () => {
    const labels = getChannelMapLabels(
      [
        { annotationValue: 9, centerFraction: 0, areaPixels: 4 },
        { annotationValue: 8, centerFraction: 0.005, areaPixels: 40 },
        { annotationValue: 7, centerFraction: 1, areaPixels: 9 }
      ],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels).toEqual([
      { key: "8-0.005", abbreviation: "B", topPixels: 0 },
      { key: "7-1", abbreviation: "C", topPixels: 588 }
    ]);
  });

  it("breaks an equal-area conflict in favour of the topmost run", () => {
    const labels = getChannelMapLabels(
      [
        { annotationValue: 9, centerFraction: 0.5, areaPixels: 10 },
        { annotationValue: 8, centerFraction: 0.51, areaPixels: 10 }
      ],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels).toEqual([
      { key: "9-0.5", abbreviation: "A", topPixels: 294 }
    ]);
  });

  it("drops a run whose annotation value is missing from structures", () => {
    const labels = getChannelMapLabels(
      [{ annotationValue: 99, centerFraction: 0.5, areaPixels: 10 }],
      structures,
      gutterHeightPixels,
      lineHeightPixels
    );

    expect(labels).toEqual([]);
  });

  it("returns no labels for a zero-height gutter", () => {
    const labels = getChannelMapLabels(
      [{ annotationValue: 9, centerFraction: 0.5, areaPixels: 10 }],
      structures,
      0,
      lineHeightPixels
    );

    expect(labels).toEqual([]);
  });
});

describe("getChannelMapTooltipPosition", () => {
  const container = { left: 100, top: 50, width: 400, height: 300 };
  const size = { width: 60, height: 20 };

  it("places the tooltip right of the anchor, centred on it vertically", () => {
    const position = getChannelMapTooltipPosition(
      { clientX: 150, clientY: 120 },
      container,
      size
    );

    expect(position.leftPixels).toBe(150 - container.left + 8);
    expect(position.topPixels).toBe(120 - container.top - size.height / 2);
  });

  it("clamps the top to the container's bottom edge when the tooltip would overflow", () => {
    const position = getChannelMapTooltipPosition(
      { clientX: 150, clientY: 349 },
      container,
      size
    );

    expect(position.topPixels).toBe(container.height - size.height);
  });

  it("clamps the left to the container's right edge when the anchor is past it", () => {
    const position = getChannelMapTooltipPosition(
      { clientX: 600, clientY: 120 },
      container,
      size
    );

    expect(position.leftPixels).toBe(container.width - size.width);
  });

  it("clamps to zero when the tooltip is larger than the container", () => {
    const position = getChannelMapTooltipPosition(
      { clientX: 90, clientY: 40 },
      container,
      { width: 500, height: 400 }
    );

    expect(position.leftPixels).toBe(0);
    expect(position.topPixels).toBe(0);
  });
});
