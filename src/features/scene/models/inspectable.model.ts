import type { Probe } from "@/features/probe";
import type { CameraInspectable } from "./camera-inspectable.model";

export type InspectableKind = "probe" | "camera";
export type Inspectable = Probe | CameraInspectable;
