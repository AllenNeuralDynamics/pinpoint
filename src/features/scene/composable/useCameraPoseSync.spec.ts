import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, reactive, shallowRef } from "vue";
import { mount } from "@vue/test-utils";
import { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { useCameraPoseSync } from "./useCameraPoseSync";
import { toWorldVector } from "../api/coordinate-transforms.api";
import type { Atlas } from "@/features/atlas";
import { getAtlasCenter } from "@/features/atlas";
import type { CameraPose } from "@/features/experiment";
import type { AxisDirections } from "@/utils/coordinate-frame";
import {
  ATLAS_AXIS_DIRECTIONS,
  buildDefaultGlobalCoordinateSystem,
  convertCoordinate,
  getAxisDirections
} from "@/utils/coordinate-frame";
import { makeAtlas, makeCameraPose, makeManifest } from "@/test/fixtures";
import { makeTestScene } from "@/test/mount-helper";

/** Axis directions new experiments start in: x right, y anterior, z superior. */
const RAS_DIRECTIONS: AxisDirections = getAxisDirections(
  buildDefaultGlobalCoordinateSystem()
);

/**
 * Mount a throwaway component running the composable over reactive sources,
 * and a fresh Babylon camera the test attaches once it wants to simulate the
 * runtime becoming available.
 * @param pose Reactive camera pose the composable binds to.
 * @param atlas Reactive atlas the composable reads.
 * @param shouldSnap Whether a pose change is applied immediately.
 * @param axisDirections Axis directions the pose's target is expressed in.
 */
function mountSync(
  pose: CameraPose,
  atlas: Atlas,
  shouldSnap: () => boolean = () => false,
  axisDirections: AxisDirections = RAS_DIRECTIONS
) {
  const cameraRef = shallowRef<ArcRotateCamera | null>(null);
  const state = reactive({ pose, atlas, axisDirections });
  const onPoseMoving = vi.fn();
  const onPoseSettled = vi.fn();

  const wrapper = mount(
    defineComponent({
      setup() {
        useCameraPoseSync(
          cameraRef,
          () => state.atlas,
          () => state.axisDirections,
          () => state.pose,
          shouldSnap,
          onPoseMoving,
          onPoseSettled
        );
        return () => null;
      }
    })
  );

  return { wrapper, cameraRef, state, onPoseMoving, onPoseSettled };
}

/** Build a real `ArcRotateCamera` in a fresh test scene. */
function makeCamera(): ArcRotateCamera {
  const scene = makeTestScene();
  return new ArcRotateCamera("camera", 0, 0, 1, Vector3.Zero(), scene);
}

describe("useCameraPoseSync", () => {
  it("snaps the camera to the pose once it becomes available", async () => {
    const pose = reactive(
      makeCameraPose({ alpha: 1, beta: 2, radius: 3, target: [0, 0, 0] })
    );
    const { cameraRef } = mountSync(pose, makeAtlas());
    const camera = makeCamera();
    const interpolateTo = vi.spyOn(camera, "interpolateTo");

    cameraRef.value = camera;
    await nextTick();

    expect(camera.alpha).toBe(1);
    expect(camera.beta).toBe(2);
    expect(camera.radius).toBe(3);
    expect(interpolateTo).not.toHaveBeenCalled();
  });

  it("glides to a later pose change via interpolateTo", async () => {
    const pose = reactive(
      makeCameraPose({ alpha: 1, beta: 2, radius: 3, target: [0, 0, 0] })
    );
    const atlas = makeAtlas();
    const { cameraRef, state } = mountSync(pose, atlas);
    const camera = makeCamera();
    cameraRef.value = camera;
    await nextTick();
    const interpolateTo = vi.spyOn(camera, "interpolateTo");

    state.pose.alpha = 4;
    await nextTick();

    const expectedWorldTarget = toWorldVector(RAS_DIRECTIONS, atlas, [0, 0, 0]);
    expect(interpolateTo).toHaveBeenCalledWith(4, 2, 3, expectedWorldTarget);
  });

  it("reads the pose's target in the coordinate system it is expressed in", async () => {
    const atlas = makeAtlas();
    const target: [number, number, number] = [1, 2, 3];
    const pose = reactive(makeCameraPose({ target }));
    const { cameraRef } = mountSync(pose, atlas, () => false, RAS_DIRECTIONS);
    const camera = makeCamera();

    cameraRef.value = camera;
    await nextTick();

    expect(
      camera.target.equals(toWorldVector(RAS_DIRECTIONS, atlas, target))
    ).toBe(true);

    // The same numbers in an atlas-ordered system land somewhere else entirely.
    const atlasPose = reactive(makeCameraPose({ target }));
    const other = mountSync(
      atlasPose,
      atlas,
      () => false,
      ATLAS_AXIS_DIRECTIONS
    );
    const otherCamera = makeCamera();

    other.cameraRef.value = otherCamera;
    await nextTick();

    expect(
      otherCamera.target.equals(
        toWorldVector(ATLAS_AXIS_DIRECTIONS, atlas, target)
      )
    ).toBe(true);
    expect(otherCamera.target.equals(camera.target)).toBe(false);
  });

  it("snaps a later pose change immediately when shouldSnap returns true", async () => {
    const pose = reactive(
      makeCameraPose({ alpha: 1, beta: 2, radius: 3, target: [0, 0, 0] })
    );
    const atlas = makeAtlas();
    const { cameraRef, state } = mountSync(pose, atlas, () => true);
    const camera = makeCamera();
    cameraRef.value = camera;
    await nextTick();
    const interpolateTo = vi.spyOn(camera, "interpolateTo");

    state.pose.alpha = 4;
    await nextTick();

    expect(camera.alpha).toBe(4);
    expect(camera.beta).toBe(2);
    expect(camera.radius).toBe(3);
    expect(camera.isInterpolating).toBe(false);
    expect(interpolateTo).not.toHaveBeenCalled();
  });

  it("writes the settled orbit into the pose, and that readback does not move the camera again", async () => {
    const pose = reactive(
      makeCameraPose({ alpha: 1, beta: 2, radius: 3, target: [0, 0, 0] })
    );
    const { cameraRef, state, onPoseMoving, onPoseSettled } = mountSync(
      pose,
      makeAtlas()
    );
    const camera = makeCamera();
    cameraRef.value = camera;
    await nextTick();
    const interpolateTo = vi.spyOn(camera, "interpolateTo");

    // A drag the user drove directly, bypassing interpolateTo.
    camera.alpha = 1.23;
    camera.onAfterCheckInputsObservable.notifyObservers(camera);
    await nextTick();

    expect(state.pose.alpha).toBeCloseTo(1.23);
    expect(onPoseMoving).toHaveBeenCalledTimes(1);

    // A still frame settles the movement without bouncing the camera against
    // its own readback.
    camera.onAfterCheckInputsObservable.notifyObservers(camera);
    await nextTick();
    expect(onPoseSettled).toHaveBeenCalledTimes(1);
    expect(interpolateTo).not.toHaveBeenCalled();
  });

  it("writes a dragged target back in the pose's own coordinate system", async () => {
    const atlas = makeAtlas();
    const pose = reactive(makeCameraPose({ target: [0, 0, 0] }));
    const { cameraRef, state } = mountSync(pose, atlas);
    const camera = makeCamera();
    cameraRef.value = camera;
    await nextTick();

    const worldTarget = toWorldVector(RAS_DIRECTIONS, atlas, [1, 2, 3]);
    camera.setTarget(worldTarget.clone(), false, false, true);
    camera.onAfterCheckInputsObservable.notifyObservers(camera);
    await nextTick();

    expect(state.pose.target[0]).toBeCloseTo(1);
    expect(state.pose.target[1]).toBeCloseTo(2);
    expect(state.pose.target[2]).toBeCloseTo(3);
  });

  it("does not write the pose while the camera glides to one the experiment set", async () => {
    const pose = reactive(
      makeCameraPose({ alpha: 1, beta: 2, radius: 3, target: [0, 0, 0] })
    );
    const { cameraRef, state, onPoseMoving, onPoseSettled } = mountSync(
      pose,
      makeAtlas()
    );
    const camera = makeCamera();
    cameraRef.value = camera;
    await nextTick();

    // An own data property shadows the prototype getter, letting the test
    // force the interpolating state a real glide would set.
    Object.defineProperty(camera, "isInterpolating", {
      value: true,
      configurable: true
    });
    camera.alpha = 4;
    camera.onAfterCheckInputsObservable.notifyObservers(camera);
    await nextTick();

    expect(state.pose.alpha).toBe(1);
    expect(onPoseMoving).not.toHaveBeenCalled();

    Object.defineProperty(camera, "isInterpolating", {
      value: false,
      configurable: true
    });
    camera.onAfterCheckInputsObservable.notifyObservers(camera);
    camera.onAfterCheckInputsObservable.notifyObservers(camera);
    await nextTick();

    expect(state.pose.alpha).toBe(4);
    expect(onPoseSettled).toHaveBeenCalledTimes(1);
  });

  it("reports the settle when the camera is replaced mid-movement", async () => {
    const pose = reactive(
      makeCameraPose({ alpha: 1, beta: 2, radius: 3, target: [0, 0, 0] })
    );
    const { cameraRef, onPoseSettled } = mountSync(pose, makeAtlas());
    const camera = makeCamera();
    cameraRef.value = camera;
    await nextTick();

    camera.alpha = 4;
    camera.onAfterCheckInputsObservable.notifyObservers(camera);
    await nextTick();

    cameraRef.value = null;
    await nextTick();

    expect(onPoseSettled).toHaveBeenCalledTimes(1);
  });

  it("keeps the camera's world target fixed across an atlas change that shifts the origin", async () => {
    const atlas = makeAtlas();
    const pose = reactive(makeCameraPose({ target: [0, 0, 0] }));
    const { cameraRef, state } = mountSync(pose, atlas);
    const camera = makeCamera();
    cameraRef.value = camera;
    await nextTick();

    const originalWorldTarget = toWorldVector(RAS_DIRECTIONS, atlas, [0, 0, 0]);
    const interpolateTo = vi.spyOn(camera, "interpolateTo");

    // Mirrors `rebaseOntoAtlasOrigin`'s compensation: the target shifts by
    // the atlas center delta, re-expressed in the pose's own axes, so both
    // stay at the same world point.
    const newAtlas = makeAtlas({
      name: "allen_human",
      manifest: makeManifest({ shape: [[1000, 320, 456]] })
    });
    const atlasDelta = getAtlasCenter(newAtlas).map(
      (value, index) => value - getAtlasCenter(atlas)[index]!
    ) as [number, number, number];
    const delta = convertCoordinate(
      ATLAS_AXIS_DIRECTIONS,
      RAS_DIRECTIONS,
      atlasDelta
    );
    state.atlas = newAtlas;
    state.pose.target = state.pose.target.map(
      (value, index) => value + delta[index]!
    ) as [number, number, number];
    await nextTick();

    expect(interpolateTo).toHaveBeenCalledTimes(1);
    const [alpha, beta, radius, calledTarget] = interpolateTo.mock.calls[0]!;
    expect(alpha).toBe(pose.alpha);
    expect(beta).toBe(pose.beta);
    expect(radius).toBe(pose.radius);
    expect((calledTarget as Vector3).equals(originalWorldTarget)).toBe(true);
  });
});
