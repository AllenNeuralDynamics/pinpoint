import type { CameraPose } from "@/features/experiment";
import type { Probe } from "@/features/probe";
import type { SceneObject } from "./scene-object.model";

export type InspectableKind = "probe" | "camera" | "sceneObject";
export type Inspectable = Probe | CameraPose | SceneObject;
