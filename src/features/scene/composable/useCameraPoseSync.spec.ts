import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, reactive, shallowRef } from "vue";
import { mount } from "@vue/test-utils";
import { ArcRotateCamera, Vector3 } from "@babylonjs/core";
import { useCameraPoseSync } from "./useCameraPoseSync";
import { atlasToWorld } from "../api/coordinate-transforms.api";
import type { Atlas } from "@/features/atlas";
import { getAtlasCenter } from "@/features/atlas";
import type { CameraPose } from "@/features/experiment";
import { makeAtlas, makeCameraPose, makeManifest } from "@/test/fixtures";
import { makeTestScene } from "@/test/mount-helper";

/**
 * Mount a throwaway component running the composable over reactive sources,
 * and a fresh Babylon camera the test attaches once it wants to simulate the
 * runtime becoming available.
 * @param pose Reactive camera pose the composable binds to.
 * @param atlas Reactive atlas the composable reads.
 */
function mountSync(pose: CameraPose, atlas: Atlas) {
  const cameraRef = shallowRef<ArcRotateCamera | null>(null);
  const state = reactive({ pose, atlas });
  const onPoseMoving = vi.fn();
  const onPoseSettled = vi.fn();

  const wrapper = mount(
    defineComponent({
      setup() {
        useCameraPoseSync(
          cameraRef,
          () => state.atlas,
          () => state.pose,
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

    const expectedWorldTarget = atlasToWorld(atlas, [0, 0, 0]);
    expect(interpolateTo).toHaveBeenCalledWith(4, 2, 3, expectedWorldTarget);
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

    const originalWorldTarget = atlasToWorld(atlas, [0, 0, 0]);
    const interpolateTo = vi.spyOn(camera, "interpolateTo");

    // Mirrors `rebaseOntoAtlasOrigin`'s compensation: the target shifts by
    // the atlas center delta so both stay at the same world point.
    const newAtlas = makeAtlas({
      name: "allen_human",
      manifest: makeManifest({ shape: [[1000, 320, 456]] })
    });
    const delta = getAtlasCenter(newAtlas).map(
      (value, index) => value - getAtlasCenter(atlas)[index]!
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
