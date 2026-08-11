import { describe, expect, it, vi } from "vitest";
import { TransformNode, Vector3 } from "@babylonjs/core";
import type { FakeTextRenderer } from "@/test/mount-helper";
import {
  makeFakeTextRenderer,
  makeTestFontAsset,
  makeTestScene
} from "@/test/mount-helper";
import * as axisGuideApi from "./axis-guide.api";
import type { GimbalAxisLabels } from "./gimbal-axis-label.api";
import {
  buildGimbalAxisLabels,
  clearGimbalAxisLabels
} from "./gimbal-axis-label.api";

/** Gimbal axis length used across every test, in mm. */
const AXIS_LENGTH_MILLIMETERS = 18;

/** Fake renderers and the `GimbalAxisLabels` object they back, for one test. */
interface TestGimbalAxisLabels {
  renderers: [FakeTextRenderer, FakeTextRenderer, FakeTextRenderer];
  labels: GimbalAxisLabels;
}

/** Build a fresh `GimbalAxisLabels` backed by fake renderers, for one test. */
function makeTestGimbalAxisLabels(): TestGimbalAxisLabels {
  const renderers: [FakeTextRenderer, FakeTextRenderer, FakeTextRenderer] = [
    makeFakeTextRenderer(),
    makeFakeTextRenderer(),
    makeFakeTextRenderer()
  ];
  return { renderers, labels: { renderers, dispose: () => {} } };
}

describe("buildGimbalAxisLabels", () => {
  it("draws one label per axis, parented to the gimbal node", () => {
    const scene = makeTestScene();
    const fontAsset = makeTestFontAsset(scene);
    const gimbal = new TransformNode("gimbal", scene);
    const { renderers, labels } = makeTestGimbalAxisLabels();

    buildGimbalAxisLabels(
      labels,
      gimbal,
      AXIS_LENGTH_MILLIMETERS,
      ["ML", "DV", "AP"],
      fontAsset
    );

    for (const [renderer, text] of [
      [renderers[0], "ML"],
      [renderers[1], "DV"],
      [renderers[2], "AP"]
    ] as const) {
      expect(renderer.paragraphs).toHaveLength(1);
      expect(renderer.paragraphs[0]!.text).toBe(text);
      expect(renderer.parent).toBe(gimbal);
    }
  });

  it("places each label along its own axis, strictly beyond the axis length", () => {
    const scene = makeTestScene();
    const fontAsset = makeTestFontAsset(scene);
    const gimbal = new TransformNode("gimbal", scene);
    const { renderers, labels } = makeTestGimbalAxisLabels();

    buildGimbalAxisLabels(
      labels,
      gimbal,
      AXIS_LENGTH_MILLIMETERS,
      ["ML", "DV", "AP"],
      fontAsset
    );

    const directions = [Vector3.Right(), Vector3.Up(), new Vector3(0, 0, 1)];
    for (const [renderer, direction] of renderers.map(
      (renderer, axis) => [renderer, directions[axis]!] as const
    )) {
      const translation = renderer.paragraphs[0]!.worldMatrix.getTranslation();
      const distance = translation.length();
      expect(distance).toBeGreaterThan(AXIS_LENGTH_MILLIMETERS);
      expect(translation.normalize().equalsWithEpsilon(direction, 1e-6)).toBe(
        true
      );
    }
  });

  it("replaces existing labels instead of accumulating them", () => {
    const scene = makeTestScene();
    const fontAsset = makeTestFontAsset(scene);
    const gimbal = new TransformNode("gimbal", scene);
    const { renderers, labels } = makeTestGimbalAxisLabels();

    buildGimbalAxisLabels(
      labels,
      gimbal,
      AXIS_LENGTH_MILLIMETERS,
      ["ML", "DV", "AP"],
      fontAsset
    );
    buildGimbalAxisLabels(
      labels,
      gimbal,
      AXIS_LENGTH_MILLIMETERS,
      ["ML", "DV", "AP"],
      fontAsset
    );

    for (const renderer of renderers) {
      expect(renderer.paragraphs).toHaveLength(1);
    }
  });

  it("keeps the font size constant no matter how long a label's text is", () => {
    const scene = makeTestScene();
    const fontAsset = makeTestFontAsset(scene);
    const gimbal = new TransformNode("gimbal", scene);
    const short = makeTestGimbalAxisLabels();
    const long = makeTestGimbalAxisLabels();

    buildGimbalAxisLabels(
      short.labels,
      gimbal,
      AXIS_LENGTH_MILLIMETERS,
      ["ML", "DV", "AP"],
      fontAsset
    );
    buildGimbalAxisLabels(
      long.labels,
      gimbal,
      AXIS_LENGTH_MILLIMETERS,
      ["MLMLML", "DVDVDV", "APAPAP"],
      fontAsset
    );

    const fontScale = (renderer: FakeTextRenderer) =>
      Vector3.TransformNormal(
        Vector3.Right(),
        renderer.paragraphs[0]!.worldMatrix
      ).length();

    for (const [axis, shortRenderer] of short.renderers.entries()) {
      expect(fontScale(long.renderers[axis]!)).toBeCloseTo(
        fontScale(shortRenderer)
      );
    }
  });

  it("draws nothing when the reference glyph measures zero wide, avoiding an infinite scale", () => {
    const scene = makeTestScene();
    const fontAsset = makeTestFontAsset(scene);
    const gimbal = new TransformNode("gimbal", scene);
    const { renderers, labels } = makeTestGimbalAxisLabels();
    // `labelSizeEm` cannot return a zero width through the real font's tofu-glyph fallback for
    // any text it's given, so this branch is exercised by stubbing the pure measurement.
    const labelSizeEmSpy = vi
      .spyOn(axisGuideApi, "labelSizeEm")
      .mockReturnValue({ width: 0, height: 0 });

    try {
      buildGimbalAxisLabels(
        labels,
        gimbal,
        AXIS_LENGTH_MILLIMETERS,
        ["ML", "DV", "AP"],
        fontAsset
      );
    } finally {
      labelSizeEmSpy.mockRestore();
    }

    for (const renderer of renderers) {
      expect(renderer.paragraphs).toHaveLength(0);
    }
  });
});

describe("clearGimbalAxisLabels", () => {
  it("empties every renderer's paragraphs and nulls its parent", () => {
    const scene = makeTestScene();
    const fontAsset = makeTestFontAsset(scene);
    const gimbal = new TransformNode("gimbal", scene);
    const { renderers, labels } = makeTestGimbalAxisLabels();

    buildGimbalAxisLabels(
      labels,
      gimbal,
      AXIS_LENGTH_MILLIMETERS,
      ["ML", "DV", "AP"],
      fontAsset
    );
    clearGimbalAxisLabels(labels);

    for (const renderer of renderers) {
      expect(renderer.paragraphs).toHaveLength(0);
      expect(renderer.parent).toBeNull();
    }
  });
});
