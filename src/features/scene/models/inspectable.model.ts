import type { CameraPose } from "@/features/experiment";
import type { Probe } from "@/features/probe";

export type InspectableKind = "probe" | "camera";
export type Inspectable = Probe | CameraPose;
