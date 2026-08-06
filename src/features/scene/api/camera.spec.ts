import { describe, expect, it, vi } from "vitest";
import { ArcRotateCamera, Camera, Observable, Vector3 } from "@babylonjs/core";
import {
  applyCameraProjection,
  isCameraAlignedWith,
  orbitCameraTowards,
  setInitialZoom,
  trackAxisViewProjection
} from "./camera.api";
import type { CameraProjection } from "../models/camera.model";
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

describe("applyCameraProjection", () => {
  function makeRealCamera(radius: number): ArcRotateCamera {
    const scene = makeTestScene();
    return new ArcRotateCamera(
      "c",
      -Math.PI / 2,
      Math.PI / 8,
      radius,
      Vector3.Zero(),
      scene
    );
  }

  it("sizes the orthographic frustum from the camera's radius, fov, and aspect ratio", () => {
    const camera = makeRealCamera(10);

    applyCameraProjection(camera, "orthographic");

    const expectedHalfHeight = 10 * Math.tan(camera.fov / 2);
    const expectedHalfWidth =
      expectedHalfHeight * camera.getEngine().getAspectRatio(camera);
    expect(camera.mode).toBe(Camera.ORTHOGRAPHIC_CAMERA);
    expect(camera.orthoTop).toBeCloseTo(expectedHalfHeight);
    expect(camera.orthoBottom).toBe(-(camera.orthoTop ?? 0));
    expect(camera.orthoRight).toBeCloseTo(expectedHalfWidth);
    expect(camera.orthoLeft).toBe(-(camera.orthoRight ?? 0));
  });

  it("re-derives a doubled frustum when the radius doubles", () => {
    const camera = makeRealCamera(10);
    applyCameraProjection(camera, "orthographic");
    const firstTop = camera.orthoTop ?? 0;

    camera.radius = 20;
    applyCameraProjection(camera, "orthographic");

    expect(camera.orthoTop).toBeCloseTo(firstTop * 2);
  });

  it("restores perspective mode and nulls every ortho bound", () => {
    const camera = makeRealCamera(10);
    applyCameraProjection(camera, "orthographic");

    applyCameraProjection(camera, "perspective");

    expect(camera.mode).toBe(Camera.PERSPECTIVE_CAMERA);
    expect(camera.orthoTop).toBeNull();
    expect(camera.orthoBottom).toBeNull();
    expect(camera.orthoLeft).toBeNull();
    expect(camera.orthoRight).toBeNull();
  });
});

describe("isCameraAlignedWith", () => {
  function makeStubCamera(alpha: number, beta: number, radius = 42) {
    return { alpha, beta, radius } as unknown as ArcRotateCamera;
  }

  it("is aligned with +AP when facing it, and not aligned with DV", () => {
    const camera = makeStubCamera(-Math.PI / 2, Math.PI / 2);

    expect(isCameraAlignedWith(camera, new Vector3(0, 0, -1))).toBe(true);
    expect(isCameraAlignedWith(camera, new Vector3(0, 1, 0))).toBe(false);
  });

  it("stays aligned with DV across every alpha, at Babylon's own beta lower limit", () => {
    for (const alpha of [-Math.PI / 2, 0, 1.7, Math.PI]) {
      const camera = makeStubCamera(alpha, 0.01);
      expect(isCameraAlignedWith(camera, new Vector3(0, 1, 0))).toBe(true);
    }
  });

  it("breaks DV alignment once beta pitches past the tolerance, regardless of alpha", () => {
    for (const alpha of [-Math.PI / 2, 0, 1.7, Math.PI]) {
      const camera = makeStubCamera(alpha, 0.05);
      expect(isCameraAlignedWith(camera, new Vector3(0, 1, 0))).toBe(false);
    }
  });

  it("ignores radius", () => {
    const near = makeStubCamera(-Math.PI / 2, Math.PI / 2, 10);
    const far = makeStubCamera(-Math.PI / 2, Math.PI / 2, 1000);

    expect(isCameraAlignedWith(near, new Vector3(0, 0, -1))).toBe(
      isCameraAlignedWith(far, new Vector3(0, 0, -1))
    );
  });

  it("returns false for a zero-length direction", () => {
    const camera = makeStubCamera(-Math.PI / 2, Math.PI / 2);

    expect(isCameraAlignedWith(camera, new Vector3(0, 0, 0))).toBe(false);
  });
});

describe("trackAxisViewProjection", () => {
  /** +AP, -DV, and +DV world directions, matching `orbitCameraTowards`'s convention. */
  const PLUS_AP = new Vector3(0, 0, -1);
  const MINUS_DV = new Vector3(0, 1, 0);
  const PLUS_DV = new Vector3(0, -1, 0);

  /** Mutable orbit fields plus a real observable, matching what the tracker reads and reacts to. */
  type StubCamera = {
    alpha: number;
    beta: number;
    isInterpolating: boolean;
    onAfterCheckInputsObservable: Observable<unknown>;
  };

  /** Stub camera with writable orbit fields; cast to `ArcRotateCamera` only where the tracker requires it. */
  function makeStubCamera(): StubCamera {
    return {
      alpha: 0,
      beta: 0,
      isInterpolating: false,
      onAfterCheckInputsObservable: new Observable()
    };
  }

  /** Fire the camera's after-check-inputs observable, as Babylon does every frame. */
  function notify(camera: StubCamera): void {
    camera.onAfterCheckInputsObservable.notifyObservers(undefined);
  }

  /** Track a stub camera's projection in a plain local, mirroring a store field. */
  function makeProjectionCell(initial: CameraProjection) {
    let value = initial;
    return {
      get: () => value,
      set: vi.fn((next: CameraProjection) => {
        value = next;
      })
    };
  }

  it("engages orthographic once the camera settles on the axis it was sent to from perspective, stays through a DV spin, and reverts once it pitches off", () => {
    const camera = makeStubCamera();
    const cell = makeProjectionCell("perspective");
    const tracker = trackAxisViewProjection(
      camera as unknown as ArcRotateCamera,
      cell.get,
      cell.set
    );

    tracker.sendTo(MINUS_DV);
    camera.isInterpolating = true;
    notify(camera);
    expect(cell.get()).toBe("perspective");

    camera.alpha = -Math.PI / 2;
    camera.beta = 0.01;
    camera.isInterpolating = false;
    notify(camera);
    expect(cell.get()).toBe("orthographic");

    camera.alpha = 1.7;
    notify(camera);
    expect(cell.get()).toBe("orthographic");

    camera.beta = 0.5;
    notify(camera);
    expect(cell.get()).toBe("perspective");
  });

  it("does not engage orthographic when a flight is cancelled off-axis, and does not fire again on later off-axis frames", () => {
    const camera = makeStubCamera();
    const cell = makeProjectionCell("perspective");
    const tracker = trackAxisViewProjection(
      camera as unknown as ArcRotateCamera,
      cell.get,
      cell.set
    );

    tracker.sendTo(PLUS_AP);
    camera.isInterpolating = false;
    notify(camera);
    expect(cell.get()).toBe("perspective");
    expect(cell.set).not.toHaveBeenCalled();

    notify(camera);
    expect(cell.set).not.toHaveBeenCalled();
  });

  it("never reverts a projection the user chose themselves", () => {
    const camera = makeStubCamera();
    const cell = makeProjectionCell("orthographic");
    const tracker = trackAxisViewProjection(
      camera as unknown as ArcRotateCamera,
      cell.get,
      cell.set
    );

    tracker.sendTo(PLUS_DV);
    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI;
    camera.isInterpolating = false;
    notify(camera);
    expect(cell.get()).toBe("orthographic");

    camera.beta = Math.PI / 2;
    notify(camera);
    expect(cell.get()).toBe("orthographic");
  });

  it("re-parks on a new axis when sent there while already parked, then reverts once it pitches off the new axis", () => {
    const camera = makeStubCamera();
    const cell = makeProjectionCell("perspective");
    const tracker = trackAxisViewProjection(
      camera as unknown as ArcRotateCamera,
      cell.get,
      cell.set
    );

    tracker.sendTo(PLUS_DV);
    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI;
    camera.isInterpolating = false;
    notify(camera);
    expect(cell.get()).toBe("orthographic");

    tracker.sendTo(PLUS_AP);
    camera.isInterpolating = true;
    notify(camera);
    expect(cell.get()).toBe("orthographic");

    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI / 2;
    camera.isInterpolating = false;
    notify(camera);
    expect(cell.get()).toBe("orthographic");

    camera.beta = 0;
    notify(camera);
    expect(cell.get()).toBe("perspective");
  });

  it("dispose() removes the observer", () => {
    const camera = makeStubCamera();
    const cell = makeProjectionCell("perspective");
    const tracker = trackAxisViewProjection(
      camera as unknown as ArcRotateCamera,
      cell.get,
      cell.set
    );

    tracker.dispose();

    expect(camera.onAfterCheckInputsObservable.observers).toHaveLength(0);
  });
});
