import { describe, expect, it, vi } from "vitest";
import { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { orbitCameraTowards, setInitialZoom } from "./camera.api";
import { makeTestScene } from "@/test/mount-helper";

describe("setInitialZoom", () => {
  it("sets the radius to 1.5x the given AP length", () => {
    const camera = { radius: 0 } as ArcRotateCamera;

    setInitialZoom(camera, 13.2);

    expect(camera.radius).toBe(13.2 * 1.5);
  });

  it("does nothing when the AP length is zero", () => {
    const camera = { radius: 0 } as ArcRotateCamera;

    setInitialZoom(camera, 0);

    expect(camera.radius).toBe(0);
  });

  it("does nothing when the AP length is negative", () => {
    const camera = { radius: 0 } as ArcRotateCamera;

    setInitialZoom(camera, -1);

    expect(camera.radius).toBe(0);
  });
});

describe("orbitCameraTowards", () => {
  /** Stub `ArcRotateCamera` with its `interpolateTo` mock kept as its own reference. */
  function makeStubCamera() {
    const interpolateTo = vi.fn();
    const camera = {
      alpha: 1.234,
      beta: 0.1,
      radius: 42,
      interpolateTo
    } as unknown as ArcRotateCamera;
    return { camera, interpolateTo };
  }

  const cases: Array<{
    label: string;
    direction: Vector3;
    expected: [number, number];
  }> = [
    {
      label: "+AP",
      direction: new Vector3(0, 0, -1),
      expected: [-Math.PI / 2, Math.PI / 2]
    },
    {
      label: "-AP",
      direction: new Vector3(0, 0, 1),
      expected: [Math.PI / 2, Math.PI / 2]
    },
    {
      label: "+ML",
      direction: new Vector3(1, 0, 0),
      expected: [0, Math.PI / 2]
    },
    {
      label: "-ML",
      direction: new Vector3(-1, 0, 0),
      expected: [Math.PI, Math.PI / 2]
    },
    {
      label: "-DV",
      direction: new Vector3(0, 1, 0),
      expected: [-Math.PI / 2, 0]
    },
    {
      label: "+DV",
      direction: new Vector3(0, -1, 0),
      expected: [-Math.PI / 2, Math.PI]
    }
  ];

  it.each(cases)(
    "orbits to $label with (alpha, beta) = interpolateTo's arguments",
    ({ direction, expected }) => {
      const { camera, interpolateTo } = makeStubCamera();

      orbitCameraTowards(camera, direction);

      expect(interpolateTo).toHaveBeenCalledTimes(1);
      const call = interpolateTo.mock.calls[0]!;
      expect(call).toHaveLength(2);
      expect(call[0]).toBeCloseTo(expected[0]);
      expect(call[1]).toBeCloseTo(expected[1]);
    }
  );

  it("uses a fixed alpha at the DV poles, ignoring the camera's prior alpha", () => {
    const { camera, interpolateTo } = makeStubCamera();
    camera.alpha = 2.5;

    orbitCameraTowards(camera, new Vector3(0, -1, 0));

    const call = interpolateTo.mock.calls[0]!;
    expect(call[0]).toBeCloseTo(-Math.PI / 2);
  });

  it("normalizes a non-unit direction", () => {
    const { camera, interpolateTo } = makeStubCamera();

    orbitCameraTowards(camera, new Vector3(0, 0, -5));

    const call = interpolateTo.mock.calls[0]!;
    expect(call[0]).toBeCloseTo(-Math.PI / 2);
    expect(call[1]).toBeCloseTo(Math.PI / 2);
  });

  it("does nothing for a zero-length direction", () => {
    const { camera, interpolateTo } = makeStubCamera();

    orbitCameraTowards(camera, new Vector3(0, 0, 0));

    expect(interpolateTo).not.toHaveBeenCalled();
  });

  it("preserves radius and target on a real camera, and starts interpolating", () => {
    const scene = makeTestScene();
    const camera = new ArcRotateCamera(
      "c",
      -Math.PI / 2,
      Math.PI / 8,
      50,
      Vector3.Zero(),
      scene
    );

    orbitCameraTowards(camera, new Vector3(0, 0, 1));

    expect(camera.isInterpolating).toBe(true);
    expect(camera.radius).toBe(50);
    expect(camera.target.equals(Vector3.Zero())).toBe(true);
  });
});
