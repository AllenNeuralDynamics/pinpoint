import type { CameraPose } from "@/features/experiment";
import type { Probe } from "@/features/probe";
import type { SceneObject } from "./scene-object.model";
import type { CoordinateSystem } from "@/features/coordinate-system";

/** The scene's world settings. Exactly one exists, so it carries no identity. */
export interface WorldInspectable {
  inspectableKind: "world";
}

export type InspectableKind =
  | "probe"
  | "camera"
  | "sceneObject"
  | "world"
  | "coordinateSystem";
export type Inspectable =
  | Probe
  | CameraPose
  | SceneObject
  | WorldInspectable
  | CoordinateSystem;

/** The scene's single world inspectable, selected to open the world inspector. */
export const WORLD_INSPECTABLE: WorldInspectable = { inspectableKind: "world" };
