import { describe, expect, it } from "vitest";
import type { ArcRotateCamera } from "@babylonjs/core";
import { setInitialZoom } from "./camera.api";
import { makeManifest } from "@/test/fixtures";

describe("setInitialZoom", () => {
  it("sets the radius to 1.5x the AP length of the finest resolution", () => {
    const camera = { radius: 0 } as ArcRotateCamera;
    const manifest = makeManifest({
      resolutions: [[0.025, 0.025, 0.025]],
      shape: [[528, 320, 456]]
    });

    setInitialZoom(manifest, camera);

    expect(camera.radius).toBe(528 * 0.025 * 1.5);
  });

  it("does nothing when the manifest has no resolutions", () => {
    const camera = { radius: 0 } as ArcRotateCamera;
    const manifest = makeManifest({
      resolutions: [],
      shape: [[528, 320, 456]]
    });

    setInitialZoom(manifest, camera);

    expect(camera.radius).toBe(0);
  });

  it("does nothing when the manifest has no shapes", () => {
    const camera = { radius: 0 } as ArcRotateCamera;
    const manifest = makeManifest({
      resolutions: [[0.025, 0.025, 0.025]],
      shape: []
    });

    setInitialZoom(manifest, camera);

    expect(camera.radius).toBe(0);
  });
});
