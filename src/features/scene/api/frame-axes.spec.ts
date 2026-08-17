import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import {
  buildCoordinateAxis,
  CANONICAL_AXIS_DIRECTIONS,
  buildDefaultGlobalCoordinateSystem,
  buildDefaultLocalCoordinateSystem,
  getDirectionVector,
  getProbeRestRotation,
  transformVector,
  type GlobalCoordinateSystem,
  type LocalCoordinateSystem
} from "@/utils/coordinate-frame";
import {
  getGlobalFrameAxes,
  getLocalFrameAxes,
  getNodeFrameAxes,
  GLOBAL_FRAME_AXIS_COLORS,
  LOCAL_FRAME_AXIS_COLORS
} from "./frame-axes.api";
import { toWorldDirection } from "./coordinate-transforms.api";

/** Labels the specs pass through, distinct per axis so a mix-up is visible. */
const LABELS: [string, string, string] = ["First", "Second", "Third"];

/**
 * Anatomical direction a probe body direction points, for a probe resting in
 * the given local coordinate system.
 * @param system Local coordinate system the probe rests in.
 * @param bodyDirection Direction in the probe's own body axes.
 */
function anatomyOf(
  system: LocalCoordinateSystem,
  bodyDirection: [number, number, number]
): [number, number, number] {
  return transformVector(getProbeRestRotation(system), bodyDirection);
}

describe("getGlobalFrameAxes", () => {
  it("points each axis exactly where the coordinate system defines it", () => {
    const system = buildDefaultGlobalCoordinateSystem();

    const { axes, isNodeLocal } = getGlobalFrameAxes(system, LABELS);

    expect(isNodeLocal).toBe(false);
    axes.forEach((axis, index) => {
      const expected = toWorldDirection(
        CANONICAL_AXIS_DIRECTIONS,
        getDirectionVector(system.axes[index]!.direction)
      );
      expect(axis.direction.equalsWithEpsilon(expected)).toBe(true);
    });
  });

  it("flips an axis's handle when its direction is reversed", () => {
    const forward = buildDefaultGlobalCoordinateSystem();
    const reversed: GlobalCoordinateSystem = {
      ...forward,
      axes: [
        buildCoordinateAxis("Right_to_left"),
        forward.axes[1],
        forward.axes[2]
      ]
    };

    const before = getGlobalFrameAxes(forward, LABELS).axes[0]!.direction;
    const after = getGlobalFrameAxes(reversed, LABELS).axes[0]!.direction;

    expect(after.equalsWithEpsilon(before.negate())).toBe(true);
  });

  it("keeps a frame no node rotation could express exact", () => {
    // Babylon's world space mirrors anatomy, so the default anatomically
    // right-handed RAS system comes out left-handed in world coordinates: x
    // cross y runs opposite z. A node's frame is always a proper rotation, so a
    // proxy node would have had to silently flip one of the three axes.
    const { axes } = getGlobalFrameAxes(
      buildDefaultGlobalCoordinateSystem(),
      LABELS
    );

    const cross = Vector3.Cross(axes[0]!.direction, axes[1]!.direction);

    expect(cross.equalsWithEpsilon(axes[2]!.direction.negate())).toBe(true);
  });

  it("keeps an anatomically left-handed system exact too", () => {
    const leftHanded: GlobalCoordinateSystem = {
      ...buildDefaultGlobalCoordinateSystem(),
      axes: [
        buildCoordinateAxis("Left_to_right"),
        buildCoordinateAxis("Posterior_to_anterior"),
        buildCoordinateAxis("Superior_to_inferior")
      ]
    };

    const { axes } = getGlobalFrameAxes(leftHanded, LABELS);

    axes.forEach((axis, index) => {
      const expected = toWorldDirection(
        CANONICAL_AXIS_DIRECTIONS,
        getDirectionVector(leftHanded.axes[index]!.direction)
      );
      expect(axis.direction.equalsWithEpsilon(expected)).toBe(true);
    });
  });

  it("colours axes by their anatomical line, so reordering never recolours one", () => {
    const system = buildDefaultGlobalCoordinateSystem();
    const reordered: GlobalCoordinateSystem = {
      ...system,
      axes: [system.axes[2], system.axes[0], system.axes[1]]
    };

    const { axes } = getGlobalFrameAxes(reordered, LABELS);

    expect(axes[0]!.color).toBe(GLOBAL_FRAME_AXIS_COLORS.inferiorSuperior);
    expect(axes[1]!.color).toBe(GLOBAL_FRAME_AXIS_COLORS.leftRight);
    expect(axes[2]!.color).toBe(GLOBAL_FRAME_AXIS_COLORS.posteriorAnterior);
  });

  it("labels axes in axis order", () => {
    expect(
      getGlobalFrameAxes(buildDefaultGlobalCoordinateSystem(), LABELS).axes.map(
        axis => axis.label
      )
    ).toEqual(LABELS);
  });
});

describe("getLocalFrameAxes", () => {
  it("points the forward handle where the electrodes face, not along body +Y", () => {
    const system = buildDefaultLocalCoordinateSystem();

    const { axes, isNodeLocal } = getLocalFrameAxes(system, LABELS);
    const forward = axes[1]!.direction;

    expect(isNodeLocal).toBe(true);
    // The electrode face is body -Y, so the forward handle must run against the
    // body's own +Y - the bug this frame exists to fix.
    expect(forward.equalsWithEpsilon(new Vector3(0, -1, 0))).toBe(true);
    expect(anatomyOf(system, [forward.x, forward.y, forward.z])).toEqual(
      getDirectionVector(system.forwardDirection)
    );
  });

  it("points depth and right where the coordinate system defines them", () => {
    const system = buildDefaultLocalCoordinateSystem();

    const { axes } = getLocalFrameAxes(system, LABELS);
    const [depth, , right] = axes;

    expect(
      anatomyOf(system, [
        depth!.direction.x,
        depth!.direction.y,
        depth!.direction.z
      ])
    ).toEqual(getDirectionVector(system.depthDirection));
    // Right follows from depth and forward: the animal's left, by default.
    expect(
      anatomyOf(system, [
        right!.direction.x,
        right!.direction.y,
        right!.direction.z
      ])
    ).toEqual(getDirectionVector("Right_to_left"));
  });

  it("tracks a reconfigured probe frame", () => {
    const system: LocalCoordinateSystem = {
      depthDirection: "Superior_to_inferior",
      forwardDirection: "Posterior_to_anterior"
    };

    const { axes } = getLocalFrameAxes(system, LABELS);

    expect(
      anatomyOf(system, [
        axes[0]!.direction.x,
        axes[0]!.direction.y,
        axes[0]!.direction.z
      ])
    ).toEqual(getDirectionVector("Superior_to_inferior"));
    expect(
      anatomyOf(system, [
        axes[1]!.direction.x,
        axes[1]!.direction.y,
        axes[1]!.direction.z
      ])
    ).toEqual(getDirectionVector("Posterior_to_anterior"));
  });

  it("uses the local palette, which shares no colour with the global one", () => {
    const { axes } = getLocalFrameAxes(
      buildDefaultLocalCoordinateSystem(),
      LABELS
    );

    expect(axes.map(axis => axis.color)).toEqual(LOCAL_FRAME_AXIS_COLORS);
    const globalColors = Object.values(GLOBAL_FRAME_AXIS_COLORS).map(color =>
      color.toHexString()
    );
    for (const axis of axes) {
      expect(globalColors).not.toContain(axis.color.toHexString());
    }
  });
});

describe("getNodeFrameAxes", () => {
  it("draws a plain node's own axes in the local palette", () => {
    const { axes, isNodeLocal } = getNodeFrameAxes(LABELS);

    expect(isNodeLocal).toBe(true);
    expect(axes.map(axis => axis.direction.asArray())).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]);
    expect(axes.map(axis => axis.color)).toEqual(LOCAL_FRAME_AXIS_COLORS);
    expect(axes.map(axis => axis.label)).toEqual(LABELS);
  });
});
