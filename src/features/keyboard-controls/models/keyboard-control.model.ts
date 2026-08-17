import type {
  AnatomicalDirection,
  AnatomicalLine
} from "@/utils/coordinate-frame";

/** Whether keyboard controls move the probe or turn it. */
export type KeyboardControlKind = "translate" | "rotate";

/** One key of a keyboard control pair. */
export interface KeyboardControlKey {
  /** `KeyboardEvent.code` the key reports, independent of the printed glyph. */
  code: string;
  /** Glyph shown for the key in the legend. */
  label: string;
}

/**
 * One key of a keyboard control pair, and the anatomical direction it drives the
 * probe in, whichever axis of the global coordinate system carries it.
 */
export interface KeyboardControlBinding extends KeyboardControlKey {
  direction: AnatomicalDirection;
}

/** A pair of keys driving one anatomical line, in the order the legend lists them. */
export interface KeyboardControlRow {
  kind: KeyboardControlKind;
  /** Anatomical line both keys drive, which colours the legend's row. */
  line: AnatomicalLine;
  keys: [KeyboardControlBinding, KeyboardControlBinding];
}

/** What a single recognized key press does to the probe. */
export interface KeyboardControlAction {
  kind: KeyboardControlKind;
  /**
   * Anatomical direction the press drives: a translation moves the probe that
   * way, a rotation turns it right-handed about it.
   */
  direction: AnatomicalDirection;
}

/** How far one key press moves or turns the probe. */
export interface KeyboardControlStep {
  translationMicrometers: number;
  rotationDegrees: number;
}
