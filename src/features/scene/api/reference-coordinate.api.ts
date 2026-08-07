import type { Scene, Vector3 } from "@babylonjs/core";
import { TransformNode } from "@babylonjs/core";
import { buildAtlasRootNode } from "./structures.api";
import {
  asrToBabylon,
  asrToVector3,
  babylonToAsr
} from "./coordinate-transforms.api";
import { type Atlas, getAtlasCenter } from "@/features/atlas";
import {
  atlasToReferenceRelative,
  referenceRelativeToAtlas
} from "@/features/experiment";

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

/**
 * Convert a coordinate relative to the reference coordinate into Babylon world
 * space, matching where the atlas root places the reference coordinate node.
 * @param atlas Atlas whose center anchors world space.
 * @param referenceCoordinate Experiment reference coordinate, in atlas ASR mm.
 * @param relativeCoordinate Coordinate relative to the reference coordinate, in ASR mm.
 */
export function referenceRelativeToWorld(
  atlas: Atlas,
  referenceCoordinate: [number, number, number],
  relativeCoordinate: [number, number, number]
): Vector3 {
  return asrToBabylon(
    referenceRelativeToAtlas(referenceCoordinate, relativeCoordinate)
  ).subtractInPlace(asrToBabylon(getAtlasCenter(atlas)));
}

/**
 * Convert a Babylon world coordinate into one relative to the reference
 * coordinate, in ASR mm.
 * @param atlas Atlas whose center anchors world space.
 * @param referenceCoordinate Experiment reference coordinate, in atlas ASR mm.
 * @param worldCoordinate Coordinate in Babylon world space.
 */
export function worldToReferenceRelative(
  atlas: Atlas,
  referenceCoordinate: [number, number, number],
  worldCoordinate: Vector3
): [number, number, number] {
  return atlasToReferenceRelative(
    referenceCoordinate,
    babylonToAsr(worldCoordinate.add(asrToBabylon(getAtlasCenter(atlas))))
  );
}
