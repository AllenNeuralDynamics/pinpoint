import type { Inspectable } from "../models/inspectable.model";

/**
 * Is `a` the same inspectable entity as `b`.
 * @param a First entity to compare.
 * @param b Second entity to compare.
 */
export function isSameInspectable(a: Inspectable, b: Inspectable): boolean {
  // The scene has exactly one camera, so any two camera inspectables match.
  if (a.inspectableKind === "camera" || b.inspectableKind === "camera") {
    return a.inspectableKind === b.inspectableKind;
  }
  return a.id === b.id;
}
