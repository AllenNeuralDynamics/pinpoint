import type { Scene } from "@babylonjs/core";
import { TransformNode } from "@babylonjs/core";
import { buildAtlasRootNode } from "./structures.api";
import { asrToVector3 } from "./coordinate-transforms.api";

const REFERENCE_COORDINATE_NODE_NAME = "referenceCoordinate_node";

/**
 * Build the reference coordinate node or return the existing one.
 * @param scene Scene to get or add the reference coordinate node.
 */
export function buildReferenceCoordinateNode(scene: Scene): TransformNode {
  const atlasRootNode = buildAtlasRootNode(scene);
  let referenceCoordinateNode = scene.getTransformNodeByName(
    REFERENCE_COORDINATE_NODE_NAME
  );
  if (!referenceCoordinateNode) {
    referenceCoordinateNode = new TransformNode(
      REFERENCE_COORDINATE_NODE_NAME,
      scene
    );
    referenceCoordinateNode.parent = atlasRootNode;
  }

  return referenceCoordinateNode;
}

/**
 * Set the position of the reference coordinate node.
 * @param scene Scene to set the reference coordinate of.
 * @param referenceCoordinate Reference coordinate to place the node at, in atlas ASR mm.
 */
export function setReferenceCoordinateNodePosition(
  scene: Scene,
  referenceCoordinate: [number, number, number]
) {
  buildReferenceCoordinateNode(scene).position =
    asrToVector3(referenceCoordinate);
}
