import { describe, expect, it } from "vitest";
import { makeProbeInterfaceProbe } from "@/test/fixtures";
import { getProbeContour } from "./contour.api";
import { getProbeShanks } from "./shank.api";

/** Two 0.1mm shanks 1.8mm apart, joined along a top edge at y = 10mm. */
const TWO_SHANK_CONTOUR = [
  [-1, 10],
  [-1, 0],
  [-0.9, 0],
  [-0.9, 10],
  [0.9, 10],
  [0.9, 0],
  [1, 0],
  [1, 10]
];

describe("getProbeShanks", () => {
  it("orders two shanks left to right by their shank_ids, with each shank's true width and left edge", () => {
    const probeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: TWO_SHANK_CONTOUR,
      contact_positions: [
        [-0.95, 1],
        [0.95, 1]
      ],
      shank_ids: ["0", "1"],
      contact_shapes: ["square", "square"],
      contact_shape_params: [{ width: 0.02 }, { width: 0.02 }]
    });
    const contour = getProbeContour(probeInterfaceProbe)!;

    const shanks = getProbeShanks(probeInterfaceProbe, contour);

    expect(shanks).toHaveLength(2);
    expect(shanks.map(shank => shank.id)).toEqual(["0", "1"]);
    expect(shanks.map(shank => shank.minimumXMillimeters)).toEqual([-1, 0.9]);
    shanks.forEach(shank =>
      expect(shank.widthMillimeters).toBeCloseTo(0.1, 10)
    );
  });

  it("gives each shank one ring holding exactly its own contour points", () => {
    const probeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: TWO_SHANK_CONTOUR,
      contact_positions: [
        [-0.95, 1],
        [0.95, 1]
      ],
      shank_ids: ["0", "1"],
      contact_shapes: ["square", "square"],
      contact_shape_params: [{ width: 0.02 }, { width: 0.02 }]
    });
    const contour = getProbeContour(probeInterfaceProbe)!;

    const shanks = getProbeShanks(probeInterfaceProbe, contour);

    expect(shanks[0]!.rings).toEqual([
      [
        { x: -1, y: 10 },
        { x: -1, y: 0 },
        { x: -0.9, y: 0 },
        { x: -0.9, y: 10 }
      ]
    ]);
    expect(shanks[1]!.rings).toEqual([
      [
        { x: 0.9, y: 10 },
        { x: 0.9, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 10 }
      ]
    ]);
  });

  it("gives each shank exactly its own contact outline", () => {
    const probeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: TWO_SHANK_CONTOUR,
      contact_positions: [
        [-0.95, 1],
        [0.95, 1]
      ],
      shank_ids: ["0", "1"],
      contact_shapes: ["square", "square"],
      contact_shape_params: [{ width: 0.02 }, { width: 0.02 }]
    });
    const contour = getProbeContour(probeInterfaceProbe)!;

    const shanks = getProbeShanks(probeInterfaceProbe, contour);

    expect(shanks[0]!.contacts).toHaveLength(1);
    expect(shanks[0]!.contacts[0]!.shankId).toBe("0");
    expect(shanks[1]!.contacts).toHaveLength(1);
    expect(shanks[1]!.contacts[0]!.shankId).toBe("1");
  });

  it("falls back to one whole-contour shank owning every contact when shank_ids is absent", () => {
    const probeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: TWO_SHANK_CONTOUR,
      contact_positions: [
        [-0.95, 1],
        [0.95, 1]
      ],
      contact_shapes: ["square", "square"],
      contact_shape_params: [{ width: 0.02 }, { width: 0.02 }]
    });
    const contour = getProbeContour(probeInterfaceProbe)!;

    const shanks = getProbeShanks(probeInterfaceProbe, contour);

    expect(shanks).toHaveLength(1);
    expect(shanks[0]!.id).toBeNull();
    expect(shanks[0]!.rings).toEqual([contour.points]);
    expect(shanks[0]!.contacts).toHaveLength(2);
  });

  it("falls back to one shank when only one distinct shank_ids value exists", () => {
    const probeInterfaceProbe = makeProbeInterfaceProbe({
      si_units: "mm",
      probe_planar_contour: TWO_SHANK_CONTOUR,
      contact_positions: [
        [-0.95, 1],
        [0.95, 1]
      ],
      shank_ids: ["0", "0"],
      contact_shapes: ["square", "square"],
      contact_shape_params: [{ width: 0.02 }, { width: 0.02 }]
    });
    const contour = getProbeContour(probeInterfaceProbe)!;

    const shanks = getProbeShanks(probeInterfaceProbe, contour);

    expect(shanks).toHaveLength(1);
    expect(shanks[0]!.id).toBe("0");
  });
});
