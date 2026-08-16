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
import type { KeyboardControlStep } from "../models/keyboard-control.model";

/** Step used wherever a test needs a distinctive distance and angle. */
const STEP: KeyboardControlStep = {
  translationMicrometers: 10,
  rotationDegrees: 15
};

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
  it("drives AP with W and S, ML with A and D, and DV with Q and E", () => {
    expect(resolveKeyboardControlAction("KeyW", "translate")).toEqual({
      kind: "translate",
      axis: "ap",
      sign: -1
    });
    expect(resolveKeyboardControlAction("KeyS", "translate")).toEqual({
      kind: "translate",
      axis: "ap",
      sign: 1
    });
    expect(resolveKeyboardControlAction("KeyA", "translate")?.axis).toBe("ml");
    expect(resolveKeyboardControlAction("KeyD", "translate")?.sign).toBe(1);
    expect(resolveKeyboardControlAction("KeyQ", "translate")?.axis).toBe("dv");
    expect(resolveKeyboardControlAction("KeyE", "translate")?.sign).toBe(1);
  });

  it("turns around the vertical axis with 1 and 3, left-right with F and R, and forward with , and .", () => {
    expect(resolveKeyboardControlAction("Digit1", "rotate")).toEqual({
      kind: "rotate",
      axis: "dv",
      sign: -1
    });
    expect(resolveKeyboardControlAction("Digit3", "rotate")?.sign).toBe(1);
    expect(resolveKeyboardControlAction("KeyF", "rotate")?.axis).toBe("ml");
    expect(resolveKeyboardControlAction("KeyR", "rotate")?.sign).toBe(1);
    expect(resolveKeyboardControlAction("Comma", "rotate")).toEqual({
      kind: "rotate",
      axis: "ap",
      sign: -1
    });
    expect(resolveKeyboardControlAction("Period", "rotate")?.sign).toBe(1);
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
  it("moves the probe's tip along one axis by the step, in millimeters", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3] });

    applyKeyboardControlAction(
      probe,
      { kind: "translate", axis: "dv", sign: 1 },
      STEP
    );

    expect(probe.tipPosition).toEqual([1, 2.01, 3]);
  });

  it("moves the opposite way on a negative step", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3] });

    applyKeyboardControlAction(
      probe,
      { kind: "translate", axis: "ap", sign: -1 },
      STEP
    );

    expect(probe.tipPosition).toEqual([0.99, 2, 3]);
  });

  it("turns the probe around one axis by the step, in radians", () => {
    const probe = makeProbe({ rotation: [0, 0, 0] });

    applyKeyboardControlAction(
      probe,
      { kind: "rotate", axis: "dv", sign: 1 },
      STEP
    );

    expect(probe.rotation).toEqual([0, Math.PI / 12, 0]);
  });

  it("turns around the forward axis for AP and the left-right axis for ML", () => {
    const probe = makeProbe({ rotation: [0, 0, 0] });

    applyKeyboardControlAction(
      probe,
      { kind: "rotate", axis: "ap", sign: 1 },
      STEP
    );
    applyKeyboardControlAction(
      probe,
      { kind: "rotate", axis: "ml", sign: -1 },
      STEP
    );

    expect(probe.rotation).toEqual([Math.PI / 12, 0, -Math.PI / 12]);
  });

  it("leaves the probe's other pose triple alone", () => {
    const probe = makeProbe({ tipPosition: [1, 2, 3], rotation: [4, 5, 6] });

    applyKeyboardControlAction(
      probe,
      { kind: "translate", axis: "ml", sign: 1 },
      STEP
    );

    expect(probe.rotation).toEqual([4, 5, 6]);
  });
});
