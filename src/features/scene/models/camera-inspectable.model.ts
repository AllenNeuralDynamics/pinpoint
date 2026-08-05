/**
 * The scene's orbit camera as an inspectable. The scene has exactly one, so it
 * carries no identifying fields.
 */
export interface CameraInspectable {
  inspectableKind: "camera";
}

/** The scene camera, selected to open the camera inspector. */
export const CAMERA_INSPECTABLE: CameraInspectable = {
  inspectableKind: "camera"
};
