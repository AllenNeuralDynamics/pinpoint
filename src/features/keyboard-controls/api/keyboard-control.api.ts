import {
  setProbeRotationRadians,
  setProbeTipMillimeters
} from "@/features/probe";
import {
  clamp,
  positionUnitToMillimeters,
  rotationUnitToRadians
} from "@/utils/math";
import {
  getDirectionLine,
  getLineAxisIndex,
  type AxisDirections
} from "@/utils/coordinate-frame";
import type { Probe } from "@/features/probe";
import type { GizmoMode } from "@/features/scene";
import type {
  KeyboardControlAction,
  KeyboardControlKey,
  KeyboardControlKind,
  KeyboardControlRow,
  KeyboardControlStep
} from "../models/keyboard-control.model";

/**
 * Speed ladder one key press steps the probe by, coarsest last. Translation
 * and rotation share an index, so `-`/`+` moves both at once.
 */
export const KEYBOARD_CONTROL_STEPS: readonly KeyboardControlStep[] = [
  { translationMicrometers: 0.1, rotationDegrees: 1 },
  { translationMicrometers: 1, rotationDegrees: 1 },
  { translationMicrometers: 10, rotationDegrees: 15 },
  { translationMicrometers: 100, rotationDegrees: 15 },
  { translationMicrometers: 1000, rotationDegrees: 15 },
  { translationMicrometers: 10000, rotationDegrees: 15 }
];

/** Step the ladder starts on: 10 µm and 15° per key press. */
export const DEFAULT_KEYBOARD_CONTROL_STEP_INDEX = 2;

/** Keys that walk the speed ladder, shown as the legend's last row. */
export const KEYBOARD_SPEED_KEYS: {
  negative: KeyboardControlKey;
  positive: KeyboardControlKey;
} = {
  negative: { code: "Minus", label: "-" },
  positive: { code: "Equal", label: "+" }
};

/**
 * Key pairs per control kind, in the order the legend lists them. Each key
 * names the anatomical direction it drives, so a press means the same thing to
 * the animal whatever the global coordinate system's axes are.
 */
export const KEYBOARD_CONTROL_ROWS: Record<
  KeyboardControlKind,
  readonly KeyboardControlRow[]
> = {
  translate: [
    {
      kind: "translate",
      line: "posteriorAnterior",
      keys: [
        { code: "KeyW", label: "W", direction: "Posterior_to_anterior" },
        { code: "KeyS", label: "S", direction: "Anterior_to_posterior" }
      ]
    },
    {
      kind: "translate",
      line: "leftRight",
      keys: [
        { code: "KeyA", label: "A", direction: "Left_to_right" },
        { code: "KeyD", label: "D", direction: "Right_to_left" }
      ]
    },
    {
      kind: "translate",
      line: "inferiorSuperior",
      keys: [
        { code: "KeyQ", label: "Q", direction: "Inferior_to_superior" },
        { code: "KeyE", label: "E", direction: "Superior_to_inferior" }
      ]
    }
  ],
  rotate: [
    {
      kind: "rotate",
      line: "inferiorSuperior",
      keys: [
        { code: "Digit1", label: "1", direction: "Inferior_to_superior" },
        { code: "Digit3", label: "3", direction: "Superior_to_inferior" }
      ]
    },
    {
      kind: "rotate",
      line: "leftRight",
      keys: [
        { code: "KeyF", label: "F", direction: "Left_to_right" },
        { code: "KeyR", label: "R", direction: "Right_to_left" }
      ]
    },
    {
      kind: "rotate",
      line: "posteriorAnterior",
      keys: [
        { code: "Comma", label: ",", direction: "Posterior_to_anterior" },
        { code: "Period", label: ".", direction: "Anterior_to_posterior" }
      ]
    }
  ]
};

/** Numpad codes accepted alongside `Minus` and `Equal` for the speed ladder. */
const NUMPAD_SPEED_CODES: Record<string, -1 | 1> = {
  NumpadSubtract: -1,
  NumpadAdd: 1
};

/** Every key press, by kind then `KeyboardEvent.code`. */
const ACTIONS_BY_CODE: Record<
  KeyboardControlKind,
  Record<string, KeyboardControlAction>
> = {
  translate: buildActionsByCode("translate"),
  rotate: buildActionsByCode("rotate")
};

/**
 * Which controls the enabled transform gizmo maps the keyboard to, or null when
 * it has none: scaling a probe's body model is not a pose edit.
 * @param mode Transform gizmo the user has enabled.
 */
export function resolveKeyboardControlKind(
  mode: GizmoMode
): KeyboardControlKind | null {
  if (mode === "position") return "translate";
  if (mode === "rotation") return "rotate";
  return null;
}

/**
 * What a key press does to the probe under the given controls, or null when the
 * key is not one of them.
 * @param code `KeyboardEvent.code` of the pressed key.
 * @param kind Controls currently mapped to the keyboard.
 */
export function resolveKeyboardControlAction(
  code: string,
  kind: KeyboardControlKind
): KeyboardControlAction | null {
  return ACTIONS_BY_CODE[kind][code] ?? null;
}

/**
 * Direction a key press walks the speed ladder in, or null when the key does
 * not walk it.
 * @param code `KeyboardEvent.code` of the pressed key.
 */
export function resolveKeyboardSpeedDelta(code: string): -1 | 1 | null {
  if (code === KEYBOARD_SPEED_KEYS.negative.code) return -1;
  if (code === KEYBOARD_SPEED_KEYS.positive.code) return 1;
  return NUMPAD_SPEED_CODES[code] ?? null;
}

/**
 * Walk the speed ladder, stopping at either end.
 * @param index Current ladder index.
 * @param delta Steps to move, signed.
 */
export function stepKeyboardControlIndex(index: number, delta: number): number {
  return clamp(index + delta, 0, KEYBOARD_CONTROL_STEPS.length - 1);
}

/**
 * Move or turn a probe by one key press, in place.
 * @param probe Probe to drive.
 * @param globalDirections Axis directions the probe's triples are expressed in.
 * @param action Anatomical direction the pressed key drives.
 * @param step Distance and angle one key press covers.
 */
export function applyKeyboardControlAction(
  probe: Probe,
  globalDirections: AxisDirections,
  action: KeyboardControlAction,
  step: KeyboardControlStep
): void {
  const index = getLineAxisIndex(
    globalDirections,
    getDirectionLine(action.direction)
  );
  // The key drives an anatomical direction, so a triple whose axis runs the
  // other way along that line takes the opposite sign.
  const sign = globalDirections[index] === action.direction ? 1 : -1;

  if (action.kind === "translate") {
    const tipPosition = [...probe.tipPosition] as [number, number, number];
    tipPosition[index] +=
      sign *
      positionUnitToMillimeters(step.translationMicrometers, "micrometer");
    setProbeTipMillimeters(probe, tipPosition);
    return;
  }

  const rotation = [...probe.rotation] as [number, number, number];
  rotation[index] +=
    sign * rotationUnitToRadians(step.rotationDegrees, "degree");
  setProbeRotationRadians(probe, rotation);
}

/**
 * Index a control kind's key pairs by the `KeyboardEvent.code` each key reports.
 * @param kind Control kind to index.
 */
function buildActionsByCode(
  kind: KeyboardControlKind
): Record<string, KeyboardControlAction> {
  return Object.fromEntries(
    KEYBOARD_CONTROL_ROWS[kind].flatMap(({ keys }) =>
      keys.map(({ code, direction }): [string, KeyboardControlAction] => [
        code,
        { kind, direction }
      ])
    )
  );
}
