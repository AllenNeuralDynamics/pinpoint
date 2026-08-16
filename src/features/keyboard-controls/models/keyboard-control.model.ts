/**
 * Atlas axis a keyboard control drives, named by the slot it addresses in a
 * probe's `tipPosition` (AP, DV, ML) and `rotation` (roll, yaw, pitch) triples.
 */
export type KeyboardControlAxis = "ap" | "dv" | "ml";

/** Whether keyboard controls move the probe or turn it. */
export type KeyboardControlKind = "translate" | "rotate";

/** One key of a keyboard control pair. */
export interface KeyboardControlKey {
  /** `KeyboardEvent.code` the key reports, independent of the printed glyph. */
  code: string;
  /** Glyph shown for the key in the legend. */
  label: string;
}

/** A single keyboard control axis and the key pair that drives it. */
export interface KeyboardControlRow {
  kind: KeyboardControlKind;
  axis: KeyboardControlAxis;
  /** Key that steps the axis in its negative direction. */
  negative: KeyboardControlKey;
  /** Key that steps the axis in its positive direction. */
  positive: KeyboardControlKey;
}

/** What a single recognized key press does to the probe. */
export interface KeyboardControlAction {
  kind: KeyboardControlKind;
  axis: KeyboardControlAxis;
  /** Direction along the axis: 1 positive, -1 negative. */
  sign: 1 | -1;
}

/** How far one key press moves or turns the probe. */
export interface KeyboardControlStep {
  translationMicrometers: number;
  rotationDegrees: number;
}
