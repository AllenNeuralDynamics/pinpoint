import { describe, expect, it } from "vitest";
import {
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  getAxisDirections,
  getDirectionVector,
  getDownwardProbeRotation,
  getLineAxisIndex,
  getProbeRestRotation,
  getRotationMatrix,
  getRotationTriple,
  getVectorDirection,
  multiplyMatrices,
  transformVector,
  type AnatomicalDirection,
  type GlobalCoordinateSystem,
  type LocalCoordinateSystem
} from "./coordinate-frame";

/** Global coordinate system every case below reads its axes from. */
const GLOBAL: GlobalCoordinateSystem = buildDefaultGlobalCoordinateSystem();

/** Probe rest orientation: depth posterior, electrodes facing superior. */
const LOCAL: LocalCoordinateSystem = buildDefaultLocalCoordinateSystem();

/** A quarter turn, in radians. */
const QUARTER = Math.PI / 2;

/**
 * Build a rotation triple from named rotations, so a case reads the way a user
 * describes a pose rather than as an axis-indexed triple.
 * @param global Global coordinate system the values turn about.
 * @param turns Rotation per named axis, in radians.
 */
function buildRotation(
  global: GlobalCoordinateSystem,
  turns: { yaw?: number; pitch?: number; roll?: number }
): [number, number, number] {
  const directions = getAxisDirections(global);
  const radians: [number, number, number] = [0, 0, 0];
  radians[getLineAxisIndex(directions, "inferiorSuperior")] = turns.yaw ?? 0;
  radians[getLineAxisIndex(directions, "leftRight")] = turns.pitch ?? 0;
  radians[getLineAxisIndex(directions, "posteriorAnterior")] = turns.roll ?? 0;
  return radians;
}

/**
 * Where a probe's own axes point once its rotation is applied to its rest
 * orientation, as anatomical directions.
 * @param global Global coordinate system the rotation turns about.
 * @param local Local coordinate system the probe rests in.
 * @param radians Probe rotation, in radians.
 */
function getProbeAxes(
  global: GlobalCoordinateSystem,
  local: LocalCoordinateSystem,
  radians: [number, number, number]
): Record<"depth" | "forward" | "right", AnatomicalDirection | null> {
  const orientation = multiplyMatrices(
    getRotationMatrix(getAxisDirections(global), radians),
    getProbeRestRotation(local)
  );
  // Body axes: x is the probe's right, -y the electrode face, -z the depth
  // direction. Rounding clears the 1e-17 residue a quarter turn leaves.
  const along = (body: [number, number, number]) =>
    getVectorDirection(
      transformVector(orientation, body).map(value => Math.round(value)) as [
        number,
        number,
        number
      ]
    );
  return {
    depth: along([0, 0, -1]),
    forward: along([0, -1, 0]),
    right: along([1, 0, 0])
  };
}

describe("probe rotation semantics", () => {
  it("rests with depth posterior, electrodes superior and probe-right on the animal's left", () => {
    expect(getProbeAxes(GLOBAL, LOCAL, [0, 0, 0])).toEqual({
      depth: "Anterior_to_posterior",
      forward: "Inferior_to_superior",
      right: "Right_to_left"
    });
  });

  it("stands the probe vertical, depth inferior, at a pitch of 90", () => {
    expect(
      getProbeAxes(GLOBAL, LOCAL, buildRotation(GLOBAL, { pitch: QUARTER }))
        .depth
    ).toBe("Superior_to_inferior");
  });

  it("stands the probe vertical, depth superior, at a pitch of -90", () => {
    expect(
      getProbeAxes(GLOBAL, LOCAL, buildRotation(GLOBAL, { pitch: -QUARTER }))
        .depth
    ).toBe("Inferior_to_superior");
  });

  it("keeps a pitched probe vertical while a yaw turns its face to the animal's left", () => {
    const axes = getProbeAxes(
      GLOBAL,
      LOCAL,
      buildRotation(GLOBAL, { pitch: QUARTER, yaw: -QUARTER })
    );

    // The whole point of the composition order: yawing a vertical probe spins it
    // in place instead of swinging its depth axis off the vertical.
    expect(axes.depth).toBe("Superior_to_inferior");
    expect(axes.forward).toBe("Right_to_left");
  });

  it("turns a pitched probe's face to the animal's right at the opposite yaw", () => {
    const axes = getProbeAxes(
      GLOBAL,
      LOCAL,
      buildRotation(GLOBAL, { pitch: QUARTER, yaw: QUARTER })
    );

    expect(axes.depth).toBe("Superior_to_inferior");
    expect(axes.forward).toBe("Left_to_right");
  });

  it("turns a resting probe's depth axis with a yaw", () => {
    const axes = getProbeAxes(
      GLOBAL,
      LOCAL,
      buildRotation(GLOBAL, { yaw: QUARTER })
    );

    // Resting depth is posterior and horizontal, so a yaw swings it sideways
    // and leaves the electrode face pointing superior.
    expect(axes.depth).toBe("Left_to_right");
    expect(axes.forward).toBe("Inferior_to_superior");
  });

  it("spins a resting probe about its own shank with a roll", () => {
    const axes = getProbeAxes(
      GLOBAL,
      LOCAL,
      buildRotation(GLOBAL, { roll: QUARTER })
    );

    // Rest depth runs along the posterior-anterior line, which is the roll axis,
    // so a roll leaves the depth axis alone and turns the face.
    expect(axes.depth).toBe("Anterior_to_posterior");
    expect(axes.forward).toBe("Left_to_right");
  });

  it("keeps a pitch and a roll independent of each other", () => {
    const pitchThenRoll = getProbeAxes(
      GLOBAL,
      LOCAL,
      buildRotation(GLOBAL, { pitch: QUARTER, roll: QUARTER })
    );

    // The roll applies in the probe's own resting frame, so a rolled probe
    // still points its depth axis wherever the pitch alone would.
    expect(pitchThenRoll.depth).toBe("Superior_to_inferior");
    expect(pitchThenRoll.forward).toBe("Left_to_right");
  });

  it("turns each axis the way the right-hand rule says", () => {
    const directions = getAxisDirections(GLOBAL);
    const cases: {
      turns: { yaw?: number; pitch?: number; roll?: number };
      start: AnatomicalDirection;
      end: AnatomicalDirection;
    }[] = [
      // Right-handed about superior takes the animal's right to anterior.
      {
        turns: { yaw: QUARTER },
        start: "Left_to_right",
        end: "Posterior_to_anterior"
      },
      // Right-handed about the animal's right takes anterior to superior.
      {
        turns: { pitch: QUARTER },
        start: "Posterior_to_anterior",
        end: "Inferior_to_superior"
      },
      // Right-handed about anterior takes superior to the animal's right.
      {
        turns: { roll: QUARTER },
        start: "Inferior_to_superior",
        end: "Left_to_right"
      }
    ];

    for (const { turns, start, end } of cases) {
      const rotated = transformVector(
        getRotationMatrix(directions, buildRotation(GLOBAL, turns)),
        getDirectionVector(start)
      );
      expect(
        getVectorDirection(
          rotated.map(value => Math.round(value)) as [number, number, number]
        )
      ).toBe(end);
    }
  });

  it("round trips every combination of quarter turns", () => {
    const directions = getAxisDirections(GLOBAL);
    const angles = [0, QUARTER, Math.PI, -QUARTER];

    for (const yaw of angles) {
      for (const roll of angles) {
        // A pitch at a pole is the one pose whose yaw and roll share an axis,
        // so it is covered separately below.
        for (const pitch of [0, Math.PI, QUARTER / 2]) {
          const radians = buildRotation(GLOBAL, { yaw, pitch, roll });
          const matrix = getRotationMatrix(directions, radians);

          const decomposed = getRotationTriple(directions, matrix);

          getRotationMatrix(directions, decomposed).forEach((value, index) =>
            expect(value).toBeCloseTo(matrix[index]!, 9)
          );
        }
      }
    }
  });

  it("keeps a pole pose's orientation when its yaw and roll collapse together", () => {
    const directions = getAxisDirections(GLOBAL);
    const radians = buildRotation(GLOBAL, {
      pitch: QUARTER,
      yaw: 0.3,
      roll: 0.2
    });
    const matrix = getRotationMatrix(directions, radians);

    const decomposed = getRotationTriple(directions, matrix);

    expect(decomposed[getLineAxisIndex(directions, "posteriorAnterior")]).toBe(
      0
    );
    getRotationMatrix(directions, decomposed).forEach((value, index) =>
      expect(value).toBeCloseTo(matrix[index]!, 9)
    );
  });

  it("points a new probe's depth axis inferior for any local coordinate system", () => {
    const systems: LocalCoordinateSystem[] = [
      LOCAL,
      {
        depthDirection: "Superior_to_inferior",
        forwardDirection: "Posterior_to_anterior"
      },
      {
        depthDirection: "Left_to_right",
        forwardDirection: "Inferior_to_superior"
      },
      {
        depthDirection: "Inferior_to_superior",
        forwardDirection: "Left_to_right"
      }
    ];

    for (const local of systems) {
      const radians = getDownwardProbeRotation(GLOBAL, local);

      expect(getProbeAxes(GLOBAL, local, radians).depth).toBe(
        "Superior_to_inferior"
      );
    }
  });

  it("holds the same semantics in a reordered, reversed coordinate system", () => {
    const flipped: GlobalCoordinateSystem = {
      ...GLOBAL,
      axes: [GLOBAL.axes[2]!, GLOBAL.axes[1]!, GLOBAL.axes[0]!]
    };

    const axes = getProbeAxes(
      flipped,
      LOCAL,
      buildRotation(flipped, { pitch: QUARTER, yaw: -QUARTER })
    );

    expect(axes.depth).toBe("Superior_to_inferior");
    expect(axes.forward).toBe("Right_to_left");
  });
});
