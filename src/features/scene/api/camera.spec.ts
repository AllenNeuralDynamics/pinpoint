import { describe, expect, it, vi } from "vitest";
import { ArcRotateCamera, Camera, Observable, Vector3 } from "@babylonjs/core";
import {
  applyCameraProjection,
  interpolateCameraToPose,
  isCameraAlignedWith,
  orbitCameraTowards,
  scaleCameraClipPlanesToAtlas,
  snapCameraToPose,
  trackAxisViewProjection,
  trackCameraPose
} from "./camera.api";
import type { CameraProjection } from "../models/camera.model";
import { getAtlasLongestDimensionMillimeters } from "@/features/atlas";
import { buildCameraPose } from "@/features/experiment";
import { makeAtlas, makeCameraPose, makeManifest } from "@/test/fixtures";
import { makeTestScene } from "@/test/mount-helper";

describe("snapCameraToPose", () => {
  it("writes alpha/beta/radius, sets the world target, and stops any interpolation", () => {
    const stopInterpolation = vi.fn();
    const setTarget = vi.fn();
    const camera = {
      alpha: 0,
      beta: 0,
      radius: 0,
      stopInterpolation,
      setTarget
    } as unknown as ArcRotateCamera;
    const pose = makeCameraPose({ alpha: 1, beta: 2, radius: 3 });
    const worldTarget = new Vector3(4, 5, 6);

    snapCameraToPose(camera, pose, worldTarget);

    expect(stopInterpolation).toHaveBeenCalled();
    expect(camera.alpha).toBe(1);
    expect(camera.beta).toBe(2);
    expect(camera.radius).toBe(3);
    expect(setTarget).toHaveBeenCalledWith(worldTarget, false, false, true);
  });
});

describe("interpolateCameraToPose", () => {
  it("interpolates to the pose's orbit and the given world target", () => {
    const interpolateTo = vi.fn();
    const camera = { interpolateTo } as unknown as ArcRotateCamera;
    const pose = makeCameraPose({ alpha: 1, beta: 2, radius: 3 });
    const worldTarget = new Vector3(4, 5, 6);

    interpolateCameraToPose(camera, pose, worldTarget);

    expect(interpolateTo).toHaveBeenCalledWith(1, 2, 3, worldTarget);
  });
});

describe("trackCameraPose", () => {
  /** Mutable orbit/target fields plus a real observable, matching what the tracker reads and reacts to. */
  type StubCamera = {
    alpha: number;
    beta: number;
    radius: number;
    target: Vector3;
    isInterpolating: boolean;
    onAfterCheckInputsObservable: Observable<unknown>;
  };

  /** Stub camera with writable orbit/target fields; cast to `ArcRotateCamera` only where the tracker requires it. */
  function makeStubCamera(): StubCamera {
    return {
      alpha: 0,
      beta: 0,
      radius: 1,
      target: Vector3.Zero(),
      isInterpolating: false,
      onAfterCheckInputsObservable: new Observable()
    };
  }

  /** Fire the camera's after-check-inputs observable, as Babylon does every frame. */
  function notify(camera: StubCamera): void {
    camera.onAfterCheckInputsObservable.notifyObservers(undefined);
  }

  it("a changed frame calls onMove with the new orbit and the camera's target and does not call onSettle", () => {
    const camera = makeStubCamera();
    const onMove = vi.fn();
    const onSettle = vi.fn();
    trackCameraPose(camera as unknown as ArcRotateCamera, onMove, onSettle);

    camera.alpha = 1;
    notify(camera);

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith([1, 0, 1], camera.target);
    expect(onSettle).not.toHaveBeenCalled();
  });

  it("the following still frame calls onSettle once, and a third frame calls neither again", () => {
    const camera = makeStubCamera();
    const onMove = vi.fn();
    const onSettle = vi.fn();
    trackCameraPose(camera as unknown as ArcRotateCamera, onMove, onSettle);

    camera.alpha = 1;
    notify(camera);
    onMove.mockClear();

    notify(camera);
    expect(onMove).not.toHaveBeenCalled();
    expect(onSettle).toHaveBeenCalledTimes(1);

    notify(camera);
    expect(onMove).not.toHaveBeenCalled();
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it("reports moves while interpolating but settles only once isInterpolating clears", () => {
    const camera = makeStubCamera();
    const onMove = vi.fn();
    const onSettle = vi.fn();
    trackCameraPose(camera as unknown as ArcRotateCamera, onMove, onSettle);
    notify(camera);
    onMove.mockClear();

    camera.alpha = 1;
    camera.isInterpolating = true;
    notify(camera);
    expect(onMove).toHaveBeenCalledTimes(1);

    notify(camera);
    expect(onSettle).not.toHaveBeenCalled();

    camera.isInterpolating = false;
    notify(camera);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it("reports nothing on repeated still frames without a change", () => {
    const camera = makeStubCamera();
    const onMove = vi.fn();
    const onSettle = vi.fn();
    trackCameraPose(camera as unknown as ArcRotateCamera, onMove, onSettle);
    notify(camera);
    notify(camera);
    onMove.mockClear();
    onSettle.mockClear();

    notify(camera);
    notify(camera);

    expect(onMove).not.toHaveBeenCalled();
    expect(onSettle).not.toHaveBeenCalled();
  });

  it("also settles a target-only change, reporting onMove then onSettle", () => {
    const camera = makeStubCamera();
    const onMove = vi.fn();
    const onSettle = vi.fn();
    trackCameraPose(camera as unknown as ArcRotateCamera, onMove, onSettle);
    notify(camera);
    notify(camera);
    onMove.mockClear();
    onSettle.mockClear();

    camera.target = new Vector3(1, 0, 0);
    notify(camera);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith([0, 0, 1], camera.target);
    expect(onSettle).not.toHaveBeenCalled();

    notify(camera);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith([0, 0, 1], camera.target);
  });

  it("dispose() empties the observer list", () => {
    const camera = makeStubCamera();
    const tracker = trackCameraPose(
      camera as unknown as ArcRotateCamera,
      vi.fn(),
      vi.fn()
    );

    tracker.dispose();

    expect(camera.onAfterCheckInputsObservable.observers).toHaveLength(0);
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

describe("scaleCameraClipPlanesToAtlas", () => {
  function makeRealCamera(): ArcRotateCamera {
    const scene = makeTestScene();
    return new ArcRotateCamera(
      "c",
      -Math.PI / 2,
      Math.PI / 8,
      10,
      Vector3.Zero(),
      scene
    );
  }

  it("sets the near plane to a hundredth and the far plane to a thousand times the atlas's longest dimension", () => {
    const camera = makeRealCamera();

    scaleCameraClipPlanesToAtlas(camera, 13.2);

    expect(camera.minZ).toBeCloseTo(0.132);
    expect(camera.maxZ).toBeCloseTo(13200);
  });

  it("scales both planes linearly with the atlas's size", () => {
    const camera = makeRealCamera();

    scaleCameraClipPlanesToAtlas(camera, 1.32);

    expect(camera.minZ).toBeCloseTo(0.0132);
    expect(camera.maxZ).toBeCloseTo(1320);
  });

  it("leaves a zero-sized atlas alone", () => {
    const camera = makeRealCamera();

    scaleCameraClipPlanesToAtlas(camera, 0);

    expect(camera.minZ).toBe(1);
    expect(camera.maxZ).toBe(10000);
  });

  it("keeps the near plane inside the framed radius of a sub-millimetre atlas", () => {
    // Drosophila wing disc: 320 x 320 x 146 voxels at 2 um, framed at
    // 0.96 mm -- inside Babylon's fixed 1 mm default near plane.
    const atlas = makeAtlas({
      manifest: makeManifest({
        resolutions: [[0.002, 0.002, 0.002]],
        shape: [[320, 320, 146]]
      })
    });
    const camera = makeRealCamera();

    scaleCameraClipPlanesToAtlas(
      camera,
      getAtlasLongestDimensionMillimeters(atlas)
    );

    expect(camera.minZ).toBeLessThan(buildCameraPose(atlas).radius);
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
