import { describe, expect, it } from "vitest";
import {
  applyKeyboardControlAction,
  DEFAULT_KEYBOARD_CONTROL_STEP_INDEX,
  KEYBOARD_CONTROL_STEPS,
  resolveKeyboardControlAction,
  resolveKeyboardControlKind,
  resolveKeyboardSpeedDelta,
  stepKeyboardControlIndex
} from "./keyboard-control.api";
import { makeProbe } from "@/test/fixtures";
import type { AxisDirections } from "@/utils/coordinate-frame";
import { CANONICAL_AXIS_DIRECTIONS } from "@/utils/coordinate-frame";
import type { KeyboardControlStep } from "../models/keyboard-control.model";

/** Step used wherever a test needs a distinctive distance and angle. */
const STEP: KeyboardControlStep = {
  translationMicrometers: 10,
  rotationDegrees: 15
};

/** Default global coordinate system's axes: x right, y anterior, z superior. */
const RAS: AxisDirections = CANONICAL_AXIS_DIRECTIONS;

/** Axes running the other way along every line: x left, y posterior, z inferior. */
const LPI: AxisDirections = [
  "Right_to_left",
  "Anterior_to_posterior",
  "Superior_to_inferior"
];

describe("resolveKeyboardControlKind", () => {
  it("maps the position gizmo to translation and the rotation gizmo to rotation", () => {
    expect(resolveKeyboardControlKind("position")).toBe("translate");
    expect(resolveKeyboardControlKind("rotation")).toBe("rotate");
  });

  it("maps the scale gizmo to no controls", () => {
    expect(resolveKeyboardControlKind("scale")).toBeNull();
  });
});

describe("resolveKeyboardControlAction", () => {
  it("moves anteriorly on W, rightwards on A, and superiorly on Q", () => {
    expect(resolveKeyboardControlAction("KeyW", "translate")).toEqual({
      kind: "translate",
      direction: "Posterior_to_anterior"
    });
    expect(resolveKeyboardControlAction("KeyS", "translate")).toEqual({
      kind: "translate",
      direction: "Anterior_to_posterior"
    });
    expect(resolveKeyboardControlAction("KeyA", "translate")?.direction).toBe(
      "Left_to_right"
    );
    expect(resolveKeyboardControlAction("KeyD", "translate")?.direction).toBe(
      "Right_to_left"
    );
    expect(resolveKeyboardControlAction("KeyQ", "translate")?.direction).toBe(
      "Inferior_to_superior"
    );
    expect(resolveKeyboardControlAction("KeyE", "translate")?.direction).toBe(
      "Superior_to_inferior"
    );
  });

  it("turns about the inferior-superior line with 1 and 3, left-right with F and R, and posterior-anterior with , and .", () => {
    expect(resolveKeyboardControlAction("Digit1", "rotate")).toEqual({
      kind: "rotate",
      direction: "Inferior_to_superior"
    });
    expect(resolveKeyboardControlAction("Digit3", "rotate")?.direction).toBe(
      "Superior_to_inferior"
    );
    expect(resolveKeyboardControlAction("KeyF", "rotate")?.direction).toBe(
      "Left_to_right"
    );
    expect(resolveKeyboardControlAction("KeyR", "rotate")?.direction).toBe(
      "Right_to_left"
    );
    expect(resolveKeyboardControlAction("Comma", "rotate")).toEqual({
      kind: "rotate",
      direction: "Posterior_to_anterior"
    });
    expect(resolveKeyboardControlAction("Period", "rotate")?.direction).toBe(
      "Anterior_to_posterior"
    );
  });

  it("ignores the other kind's keys, so the mapping follows the enabled gizmo", () => {
    expect(resolveKeyboardControlAction("KeyW", "rotate")).toBeNull();
    expect(resolveKeyboardControlAction("Digit1", "translate")).toBeNull();
  });

  it("ignores an unmapped key", () => {
    expect(resolveKeyboardControlAction("KeyZ", "translate")).toBeNull();
  });
});

describe("resolveKeyboardSpeedDelta", () => {
  it("steps down on - and up on +, on the main row and the numpad", () => {
    expect(resolveKeyboardSpeedDelta("Minus")).toBe(-1);
    expect(resolveKeyboardSpeedDelta("Equal")).toBe(1);
    expect(resolveKeyboardSpeedDelta("NumpadSubtract")).toBe(-1);
    expect(resolveKeyboardSpeedDelta("NumpadAdd")).toBe(1);
  });

  it("ignores any other key", () => {
    expect(resolveKeyboardSpeedDelta("KeyW")).toBeNull();
  });
});

describe("stepKeyboardControlIndex", () => {
  it("walks the ladder from 0.1 µm to 10000 µm, pairing 1° with the two finest steps", () => {
    expect(
      KEYBOARD_CONTROL_STEPS.map(step => step.translationMicrometers)
    ).toEqual([0.1, 1, 10, 100, 1000, 10000]);
    expect(KEYBOARD_CONTROL_STEPS.map(step => step.rotationDegrees)).toEqual([
      1, 1, 15, 15, 15, 15
    ]);
  });

  it("starts on 10 µm and 15°", () => {
    expect(KEYBOARD_CONTROL_STEPS[DEFAULT_KEYBOARD_CONTROL_STEP_INDEX]).toEqual(
      {
        translationMicrometers: 10,
        rotationDegrees: 15
      }
    );
  });

  it("stops at either end of the ladder", () => {
    expect(stepKeyboardControlIndex(0, -1)).toBe(0);
    expect(stepKeyboardControlIndex(0, 1)).toBe(1);
    expect(stepKeyboardControlIndex(KEYBOARD_CONTROL_STEPS.length - 1, 1)).toBe(
      KEYBOARD_CONTROL_STEPS.length - 1
    );
  });
});

describe("applyKeyboardControlAction", () => {
  it("moves the probe's tip along the axis running the key's line, in millimeters", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3] });

    applyKeyboardControlAction(
      probe,
      RAS,
      { kind: "translate", direction: "Inferior_to_superior" },
      STEP
    );

    expect(probe.tipPosition).toEqual([1, 2, 3.01]);
  });

  it("moves the opposite way along the axis of the opposite direction", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3] });

    applyKeyboardControlAction(
      probe,
      RAS,
      { kind: "translate", direction: "Anterior_to_posterior" },
      STEP
    );

    expect(probe.tipPosition).toEqual([1, 1.99, 3]);
  });

  it("keeps W moving the probe anteriorly when the global axis points posteriorly", () => {
    const anterior = makeProbe({ tipPosition: [1, 2, 3] });
    const posterior = makeProbe({ tipPosition: [1, 2, 3] });
    const action = resolveKeyboardControlAction("KeyW", "translate")!;

    applyKeyboardControlAction(anterior, RAS, action, STEP);
    applyKeyboardControlAction(posterior, LPI, action, STEP);

    // Same anatomical move, opposite arithmetic: the RAS axis counts anterior
    // up while the LPI axis counts it down, and both tips end up 10 µm further
    // anterior in the brain.
    expect(anterior.tipPosition).toEqual([1, 2.01, 3]);
    expect(posterior.tipPosition).toEqual([1, 1.99, 3]);
  });

  it("finds the line's axis wherever the coordinate system puts it", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3] });

    applyKeyboardControlAction(
      probe,
      ["Anterior_to_posterior", "Superior_to_inferior", "Right_to_left"],
      { kind: "translate", direction: "Left_to_right" },
      STEP
    );

    expect(probe.tipPosition).toEqual([1, 2, 2.99]);
  });

  it("turns the probe about the axis running the key's line, in radians", () => {
    const probe = makeProbe({ rotation: [0, 0, 0] });

    applyKeyboardControlAction(
      probe,
      RAS,
      { kind: "rotate", direction: "Inferior_to_superior" },
      STEP
    );

    expect(probe.rotation).toEqual([0, 0, Math.PI / 12]);
  });

  it("turns the other way when the axis runs against the key's direction", () => {
    const probe = makeProbe({ rotation: [0, 0, 0] });

    applyKeyboardControlAction(
      probe,
      LPI,
      { kind: "rotate", direction: "Inferior_to_superior" },
      STEP
    );

    expect(probe.rotation).toEqual([0, 0, -Math.PI / 12]);
  });

  it("leaves the probe's other pose triple alone", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3], rotation: [4, 5, 6] });

    applyKeyboardControlAction(
      probe,
      RAS,
      { kind: "translate", direction: "Left_to_right" },
      STEP
    );

    expect(probe.rotation).toEqual([4, 5, 6]);
  });
});
