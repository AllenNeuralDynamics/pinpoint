import { describe, expect, it } from "vitest";
import {
  ATLAS_AXIS_DIRECTIONS,
  CANONICAL_AXIS_DIRECTIONS,
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  convertCoordinate,
  convertMagnitudes,
  convertRotation,
  getAxisDirections,
  getAxisDirectionsHandedness,
  getAxisDirectionsName,
  getChainRestRotation,
  getDirectionVector,
  getDownwardProbeRotation,
  getLineAxisIndex,
  getOrientationFromFrame,
  getOrientationInFrame,
  getPositionAxisMessageKey,
  getProbeRestRotation,
  getRightDirection,
  getRotationAxisMessageKey,
  getRotationMatrix,
  getRotationTriple,
  isGlobalCoordinateSystem,
  isLocalCoordinateSystem,
  multiplyMatrices,
  transformVector,
  transposeMatrix,
  type AxisDirections,
  type GlobalCoordinateSystem,
  type LocalCoordinateSystem,
  type Matrix3
} from "./coordinate-frame";

/**
 * Frame Babylon renders the atlas in, i.e. the atlas's own axes reordered as the
 * scene node's x, y, z: x right, y inferior, z posterior.
 */
const SCENE_AXIS_DIRECTIONS: AxisDirections = [
  "Left_to_right",
  "Superior_to_inferior",
  "Anterior_to_posterior"
];

/** Radians within which two angles are the same, after matrix round trips. */
const ANGLE_TOLERANCE = 1e-9;

/**
 * Expect two matrices to agree within floating point tolerance, ignoring the
 * signed zeros matrix products produce.
 * @param actual Matrix produced by the code under test.
 * @param expected Matrix it should match.
 */
function expectMatrix(actual: Matrix3, expected: Matrix3): void {
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index]!, 9)
  );
}

/**
 * Expect two triples to agree within floating point tolerance.
 * @param actual Triple produced by the code under test.
 * @param expected Triple it should match.
 */
function expectTriple(
  actual: [number, number, number],
  expected: [number, number, number]
): void {
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index]!, 9)
  );
}

describe("buildDefaultGlobalCoordinateSystem", () => {
  it("is RAS: x right, y anterior, z superior", () => {
    const system = buildDefaultGlobalCoordinateSystem();

    expect(getAxisDirectionsName(getAxisDirections(system))).toBe("RAS");
    expect(getAxisDirectionsHandedness(getAxisDirections(system))).toBe(
      "right"
    );
  });

  it("starts with no user names and identity display orders", () => {
    const system = buildDefaultGlobalCoordinateSystem();

    expect(system.axes.map(axis => axis.positionName)).toEqual(["", "", ""]);
    expect(system.axes.map(axis => axis.rotationName)).toEqual(["", "", ""]);
    expect(system.positionDisplayOrder).toEqual([0, 1, 2]);
    expect(system.rotationDisplayOrder).toEqual([0, 1, 2]);
  });
});

describe("buildDefaultLocalCoordinateSystem", () => {
  it("points depth posterior and the electrodes superior", () => {
    const system = buildDefaultLocalCoordinateSystem();

    expect(system.depthDirection).toBe("Anterior_to_posterior");
    expect(system.forwardDirection).toBe("Inferior_to_superior");
  });

  it("puts the probe's right axis on the animal's left", () => {
    expect(getRightDirection(buildDefaultLocalCoordinateSystem())).toBe(
      "Right_to_left"
    );
  });
});

describe("ATLAS_AXIS_DIRECTIONS", () => {
  it("is the Allen CCF's PIR frame, so a larger third coordinate is further right", () => {
    expect(getAxisDirectionsName(ATLAS_AXIS_DIRECTIONS)).toBe("PIR");
    expect(getAxisDirectionsHandedness(ATLAS_AXIS_DIRECTIONS)).toBe("right");
    expect(getLineAxisIndex(ATLAS_AXIS_DIRECTIONS, "leftRight")).toBe(2);
    expect(ATLAS_AXIS_DIRECTIONS[2]).toBe("Left_to_right");
  });

  it("puts the animal's right on the scene frame's own +x", () => {
    // The probe body frame, the gizmo handles and the axis guides all inherit
    // this: if it inverts, every left and right in the app mirrors.
    expect(
      convertCoordinate(ATLAS_AXIS_DIRECTIONS, SCENE_AXIS_DIRECTIONS, [0, 0, 1])
    ).toEqual([1, 0, 0]);
    expectTriple(
      convertCoordinate(
        CANONICAL_AXIS_DIRECTIONS,
        SCENE_AXIS_DIRECTIONS,
        [1, 0, 0]
      ),
      [1, 0, 0]
    );
  });
});

describe("getDirectionVector", () => {
  it("maps directions onto canonical axes: x right, y anterior, z superior", () => {
    expect(getDirectionVector("Left_to_right")).toEqual([1, 0, 0]);
    expect(getDirectionVector("Right_to_left")).toEqual([-1, 0, 0]);
    expect(getDirectionVector("Posterior_to_anterior")).toEqual([0, 1, 0]);
    expect(getDirectionVector("Anterior_to_posterior")).toEqual([0, -1, 0]);
    expect(getDirectionVector("Inferior_to_superior")).toEqual([0, 0, 1]);
    expect(getDirectionVector("Superior_to_inferior")).toEqual([0, 0, -1]);
  });
});

describe("getLineAxisIndex", () => {
  it("finds the axis running along an anatomical line", () => {
    const directions = getAxisDirections(buildDefaultGlobalCoordinateSystem());

    expect(getLineAxisIndex(directions, "leftRight")).toBe(0);
    expect(getLineAxisIndex(directions, "posteriorAnterior")).toBe(1);
    expect(getLineAxisIndex(directions, "inferiorSuperior")).toBe(2);
    expect(getLineAxisIndex(ATLAS_AXIS_DIRECTIONS, "leftRight")).toBe(2);
  });
});

describe("convertCoordinate", () => {
  const global = getAxisDirections(buildDefaultGlobalCoordinateSystem());

  it("permutes and negates an atlas coordinate into RAS", () => {
    // The atlas's third axis already runs left to right, so only its anterior
    // and superior axes change sign.
    expect(convertCoordinate(ATLAS_AXIS_DIRECTIONS, global, [2, 3, 4])).toEqual(
      [4, -2, -3]
    );
  });

  it("round trips through the atlas frame", () => {
    const coordinate: [number, number, number] = [1.5, -2.5, 3.5];

    expect(
      convertCoordinate(
        ATLAS_AXIS_DIRECTIONS,
        global,
        convertCoordinate(global, ATLAS_AXIS_DIRECTIONS, coordinate)
      )
    ).toEqual(coordinate);
  });

  it("leaves a coordinate alone when both frames match", () => {
    expect(convertCoordinate(global, global, [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("convertMagnitudes", () => {
  it("permutes without negating, since a scale has no direction", () => {
    const global = getAxisDirections(buildDefaultGlobalCoordinateSystem());

    expect(convertMagnitudes(ATLAS_AXIS_DIRECTIONS, global, [2, 3, 4])).toEqual(
      [4, 2, 3]
    );
  });
});

describe("getRotationMatrix", () => {
  const global = getAxisDirections(buildDefaultGlobalCoordinateSystem());

  it("turns right handed about the axis's own direction", () => {
    const quarterTurnAboutRight = getRotationMatrix(global, [
      Math.PI / 2,
      0,
      0
    ]);

    // Right handed about right takes anterior to superior.
    expectTriple(transformVector(quarterTurnAboutRight, [0, 1, 0]), [0, 0, 1]);
  });

  it("reverses the turn when the axis points the other way", () => {
    const flipped: AxisDirections = [
      "Right_to_left",
      "Posterior_to_anterior",
      "Inferior_to_superior"
    ];

    expectTriple(
      transformVector(
        getRotationMatrix(flipped, [Math.PI / 2, 0, 0]),
        [0, 1, 0]
      ),
      [0, 0, -1]
    );
  });

  it("is the identity at zero", () => {
    expect(getRotationMatrix(global, [0, 0, 0])).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1
    ]);
  });
});

describe("getRotationTriple", () => {
  const global = getAxisDirections(buildDefaultGlobalCoordinateSystem());

  it("inverts getRotationMatrix", () => {
    const radians: [number, number, number] = [0.3, -0.2, 1.1];

    expectTriple(
      getRotationTriple(global, getRotationMatrix(global, radians)),
      radians
    );
  });

  it("collapses roll onto yaw at a pitch pole", () => {
    const matrix = getRotationMatrix(global, [Math.PI / 2, 0, 0]);
    const [pitch, roll, yaw] = getRotationTriple(global, matrix);

    expect(pitch).toBeCloseTo(Math.PI / 2, 9);
    expect(roll).toBeCloseTo(0, 9);
    expect(yaw).toBeCloseTo(0, 9);
  });
});

describe("convertRotation", () => {
  it("re-expresses a rotation so it turns the same way in space", () => {
    const global = getAxisDirections(buildDefaultGlobalCoordinateSystem());
    const radians: [number, number, number] = [Math.PI / 2, 0, 0];

    const inAtlas = convertRotation(global, ATLAS_AXIS_DIRECTIONS, radians);

    // The atlas's left-right axis points the same way, so the pitch keeps its
    // sign and only moves to the atlas's third slot.
    expectTriple(inAtlas, [0, 0, Math.PI / 2]);
    expectTriple(
      convertRotation(ATLAS_AXIS_DIRECTIONS, global, inAtlas),
      radians
    );
  });

  it("keeps the rotated direction the same in both frames", () => {
    const global = getAxisDirections(buildDefaultGlobalCoordinateSystem());
    const radians: [number, number, number] = [0.4, 0.5, -0.6];

    const rotatedInGlobal = transformVector(
      getRotationMatrix(global, radians),
      getDirectionVector("Anterior_to_posterior")
    );
    const rotatedInAtlas = transformVector(
      getRotationMatrix(
        ATLAS_AXIS_DIRECTIONS,
        convertRotation(global, ATLAS_AXIS_DIRECTIONS, radians)
      ),
      getDirectionVector("Anterior_to_posterior")
    );

    expectTriple(rotatedInGlobal, rotatedInAtlas);
  });
});

describe("getProbeRestRotation", () => {
  it("aims the body's z up from the tip, against the depth direction", () => {
    const rest = getProbeRestRotation(buildDefaultLocalCoordinateSystem());

    // Body z is up the shank, so it points anterior when depth is posterior.
    expectTriple(transformVector(rest, [0, 0, 1]), [0, 1, 0]);
    // Body -y is the electrode face, so it points superior.
    expectTriple(transformVector(rest, [0, -1, 0]), [0, 0, 1]);
    // Body +x is the probe's right axis, which points to the animal's left.
    expectTriple(transformVector(rest, [1, 0, 0]), [-1, 0, 0]);
  });

  it("is orthonormal, so it inverts by transposing", () => {
    const rest = getProbeRestRotation(buildDefaultLocalCoordinateSystem());

    expect(multiplyMatrices(rest, transposeMatrix(rest))).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1
    ]);
  });

  it("is the identity in scene coordinates for the legacy rest orientation", () => {
    // Before coordinate systems were configurable a probe rested with its tip
    // pointing anterior and its electrodes facing superior, which is exactly
    // the frame the scene renders the atlas in.
    const legacy: LocalCoordinateSystem = {
      depthDirection: "Posterior_to_anterior",
      forwardDirection: "Inferior_to_superior"
    };

    expectMatrix(
      getOrientationInFrame(
        SCENE_AXIS_DIRECTIONS,
        getProbeRestRotation(legacy)
      ),
      [1, 0, 0, 0, 1, 0, 0, 0, 1]
    );
  });
});

describe("getChainRestRotation", () => {
  it("aims its third axis along the depth direction", () => {
    const rest = getChainRestRotation(buildDefaultLocalCoordinateSystem());

    expectTriple(transformVector(rest, [0, 0, 1]), [0, -1, 0]);
  });

  it("is orthonormal, so it inverts by transposing", () => {
    const rest = getChainRestRotation({
      depthDirection: "Superior_to_inferior",
      forwardDirection: "Posterior_to_anterior"
    });

    expect(multiplyMatrices(rest, transposeMatrix(rest))).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1
    ]);
  });

  it("differs from the body rest orientation by a half turn about its x axis", () => {
    const local = buildDefaultLocalCoordinateSystem();
    const halfTurnAboutX: Matrix3 = [1, 0, 0, 0, -1, 0, 0, 0, -1];

    expectMatrix(
      multiplyMatrices(getProbeRestRotation(local), halfTurnAboutX),
      getChainRestRotation(local)
    );
  });
});

describe("getDownwardProbeRotation", () => {
  it("pitches a posterior depth axis down to inferior", () => {
    const global = buildDefaultGlobalCoordinateSystem();
    const local = buildDefaultLocalCoordinateSystem();

    const radians = getDownwardProbeRotation(global, local);

    expectTriple(radians, [Math.PI / 2, 0, 0]);
    expectTriple(
      transformVector(
        getRotationMatrix(getAxisDirections(global), radians),
        getDirectionVector(local.depthDirection)
      ),
      [0, 0, -1]
    );
  });

  it("leaves an already inferior depth axis alone", () => {
    expect(
      getDownwardProbeRotation(buildDefaultGlobalCoordinateSystem(), {
        depthDirection: "Superior_to_inferior",
        forwardDirection: "Posterior_to_anterior"
      })
    ).toEqual([0, 0, 0]);
  });
});

describe("getOrientationInFrame", () => {
  it("round trips an orientation through a frame's own coordinates", () => {
    const global = getAxisDirections(buildDefaultGlobalCoordinateSystem());
    const orientation = multiplyMatrices(
      getRotationMatrix(global, [0.2, 0.3, 0.4]),
      getProbeRestRotation(buildDefaultLocalCoordinateSystem())
    );

    expectMatrix(
      getOrientationFromFrame(
        SCENE_AXIS_DIRECTIONS,
        getOrientationInFrame(SCENE_AXIS_DIRECTIONS, orientation)
      ),
      orientation
    );
  });

  it("carries a body axis to the same place through either frame", () => {
    const global = getAxisDirections(buildDefaultGlobalCoordinateSystem());
    const orientation = multiplyMatrices(
      getRotationMatrix(global, [0.7, 0, 0]),
      getProbeRestRotation(buildDefaultLocalCoordinateSystem())
    );

    const shankInScene = transformVector(
      getOrientationInFrame(SCENE_AXIS_DIRECTIONS, orientation),
      [0, 0, 1]
    );

    expectTriple(
      convertCoordinate(SCENE_AXIS_DIRECTIONS, global, shankInScene),
      convertCoordinate(
        ["Left_to_right", "Posterior_to_anterior", "Inferior_to_superior"],
        global,
        transformVector(orientation, [0, 0, 1])
      )
    );
  });
});

describe("getPositionAxisMessageKey", () => {
  it("labels each anatomical line with its aind-data-schema axis name", () => {
    expect(getPositionAxisMessageKey("Left_to_right")).toBe("axis.ml");
    expect(getPositionAxisMessageKey("Anterior_to_posterior")).toBe("axis.ap");
    expect(getPositionAxisMessageKey("Superior_to_inferior")).toBe("axis.si");
  });
});

describe("getRotationAxisMessageKey", () => {
  it("names a rotation for the line it turns about", () => {
    expect(getRotationAxisMessageKey("Left_to_right")).toBe("axis.pitch");
    expect(getRotationAxisMessageKey("Posterior_to_anterior")).toBe(
      "axis.roll"
    );
    expect(getRotationAxisMessageKey("Inferior_to_superior")).toBe("axis.yaw");
  });
});

describe("isGlobalCoordinateSystem", () => {
  it("accepts a built default", () => {
    expect(isGlobalCoordinateSystem(buildDefaultGlobalCoordinateSystem())).toBe(
      true
    );
  });

  it("rejects a system that reuses an anatomical line", () => {
    const system: GlobalCoordinateSystem = buildDefaultGlobalCoordinateSystem();
    system.axes[1].direction = "Right_to_left";

    expect(isGlobalCoordinateSystem(system)).toBe(false);
  });

  it("rejects an unknown direction, a bad display order and a missing axis", () => {
    const system = buildDefaultGlobalCoordinateSystem();

    expect(
      isGlobalCoordinateSystem({
        ...system,
        axes: [{ direction: "left", positionName: "", rotationName: "" }]
      })
    ).toBe(false);
    expect(
      isGlobalCoordinateSystem({ ...system, positionDisplayOrder: [0, 0, 1] })
    ).toBe(false);
    expect(
      isGlobalCoordinateSystem({ ...system, axes: system.axes.slice(0, 2) })
    ).toBe(false);
  });

  it("rejects an axis whose names are not strings", () => {
    const system = buildDefaultGlobalCoordinateSystem();

    expect(
      isGlobalCoordinateSystem({
        ...system,
        axes: [
          { direction: "Left_to_right", positionName: 1, rotationName: "" },
          system.axes[1],
          system.axes[2]
        ]
      })
    ).toBe(false);
  });
});

describe("isLocalCoordinateSystem", () => {
  it("accepts a built default", () => {
    expect(isLocalCoordinateSystem(buildDefaultLocalCoordinateSystem())).toBe(
      true
    );
  });

  it("rejects parallel depth and forward axes", () => {
    expect(
      isLocalCoordinateSystem({
        depthDirection: "Anterior_to_posterior",
        forwardDirection: "Posterior_to_anterior"
      })
    ).toBe(false);
  });

  it("rejects unknown directions and non-objects", () => {
    expect(
      isLocalCoordinateSystem({
        depthDirection: "down",
        forwardDirection: "Inferior_to_superior"
      })
    ).toBe(false);
    expect(isLocalCoordinateSystem(null)).toBe(false);
  });
});

describe("getRightDirection", () => {
  it("follows from the depth and forward directions", () => {
    expect(
      getRightDirection({
        depthDirection: "Superior_to_inferior",
        forwardDirection: "Posterior_to_anterior"
      })
    ).toBe("Left_to_right");
  });

  it("is null when depth and forward are parallel", () => {
    expect(
      getRightDirection({
        depthDirection: "Superior_to_inferior",
        forwardDirection: "Inferior_to_superior"
      })
    ).toBeNull();
  });
});

describe("angle tolerance", () => {
  it("keeps a full rotation round trip inside tolerance", () => {
    const global = getAxisDirections(buildDefaultGlobalCoordinateSystem());
    const radians: [number, number, number] = [1.2, -0.4, 2.9];

    const roundTripped = getRotationTriple(
      global,
      getRotationMatrix(global, radians)
    );

    roundTripped.forEach((value, index) =>
      expect(Math.abs(value - radians[index]!)).toBeLessThan(ANGLE_TOLERANCE)
    );
  });
});
