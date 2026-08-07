import { beforeAll, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core";
import { GLTF2Export } from "@babylonjs/serializers/glTF/2.0";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import { canLoadModelFile } from "./model-file.api";
import { makeTestModelFile, makeTestScene } from "@/test/mount-helper";

// Mirrors the app boot's own registration: `ImportMeshAsync` needs the glTF
// plugin factory registered before it can claim a `.glb` file.
beforeAll(() => {
  registerBuiltInLoaders();
});

/** Build GLB bytes for an empty scene: a valid container with no meshes. */
async function makeEmptyGlbFile(): Promise<File> {
  const scene = makeTestScene();
  try {
    const data = await GLTF2Export.GLBAsync(scene, "empty.glb", {
      exportWithoutWaitingForScene: true
    });
    const glb = Object.values(data.files).find(value => value instanceof Blob);
    return new File([await (glb as Blob).arrayBuffer()], "empty.glb", {
      type: "model/gltf-binary"
    });
  } finally {
    scene.dispose();
  }
}

describe("canLoadModelFile", () => {
  it("resolves true for a file holding real geometry", async () => {
    const engine = new NullEngine();

    expect(await canLoadModelFile(engine, await makeTestModelFile())).toBe(
      true
    );
  });

  it("resolves false for a valid container with no meshes", async () => {
    const engine = new NullEngine();

    expect(await canLoadModelFile(engine, await makeEmptyGlbFile())).toBe(
      false
    );
  });

  it("does not report an unparsable file as loadable, and disposes the throwaway scene", async () => {
    const engine = new NullEngine();
    const file = new File(["not a model"], "broken.glb", {
      type: "model/gltf-binary"
    });

    let result: boolean | null = null;
    try {
      result = await canLoadModelFile(engine, file);
    } catch {
      // A loader throw is an acceptable failure mode too.
    }

    expect(result).not.toBe(true);
    expect(engine.scenes).toEqual([]);
  });
});
