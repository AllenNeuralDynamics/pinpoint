import type { SceneEntityKind } from "../models/scene-entity.model";

/** Collider node name pattern, capturing the entity id and kind. */
const COLLIDER_NAME_PATTERN = /^(.+)_(probe|object)_collider$/;

/**
 * Build the suffix shared by every entity name of one kind, e.g. `_probe_node`.
 * @param kind Entity kind the suffix identifies.
 * @param suffix Kind of entity within that scene entity, e.g. `node`.
 */
export function sceneEntityNameSuffix(
  kind: SceneEntityKind,
  suffix: string
): string {
  return `_${kind}_${suffix}`;
}

/**
 * Build the Babylon name for one of a scene entity's entities, derived from its id.
 * @param id Scene entity id to derive the name from.
 * @param kind Entity kind the name belongs to.
 * @param suffix Kind of entity within that scene entity, e.g. `node`.
 */
export function buildSceneEntityName(
  id: string,
  kind: SceneEntityKind,
  suffix: string
): string {
  return `${id}${sceneEntityNameSuffix(kind, suffix)}`;
}

/**
 * Check that a Babylon entity name is one of this kind's entities.
 * @param name Entity name to check.
 * @param kind Entity kind to check against.
 */
export function isSceneEntityName(
  name: string,
  kind: SceneEntityKind
): boolean {
  return name.includes(`_${kind}_`);
}

/**
 * Recover a scene entity's id from one of its entity names.
 * @param name Entity name produced by {@link buildSceneEntityName}.
 * @param kind Entity kind the name belongs to.
 */
export function sceneEntityIdFromName(
  name: string,
  kind: SceneEntityKind
): string {
  const suffixStart = name.indexOf(`_${kind}_`);
  return suffixStart === -1 ? name : name.slice(0, suffixStart);
}

/**
 * Resolve a collider node name back to its entity id and kind, or null when
 * the name isn't a collider name.
 * @param name Collider node name to resolve.
 */
export function sceneEntityFromColliderName(
  name: string
): { id: string; kind: SceneEntityKind } | null {
  const match = COLLIDER_NAME_PATTERN.exec(name);
  if (!match) return null;

  return { id: match[1]!, kind: match[2] as SceneEntityKind };
}
