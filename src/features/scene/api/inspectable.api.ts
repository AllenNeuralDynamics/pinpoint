import type { Inspectable } from "../models/inspectable.model";

/**
 * Is `a` the same inspectable entity as `b`.
 * @param a First entity to compare.
 * @param b Second entity to compare.
 */
export function isSameInspectable(a: Inspectable, b: Inspectable): boolean {
  if (a.inspectableKind !== b.inspectableKind) return false;

  switch (a.inspectableKind) {
    case "probe":
      return a.id === b.id;
    default:
      return false;
  }
}
