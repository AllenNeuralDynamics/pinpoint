import { describe, expect, it } from "vitest";
import {
  buildSceneObject,
  isSceneObject,
  toggleSceneObjectCollidable,
  toggleSceneObjectLock,
  toggleSceneObjectVisibility
} from "./scene-object.api";
import { STANDARD_COLORS } from "../models/standard-colors.model";
import { makeSceneObject } from "@/test/fixtures";

describe("buildSceneObject", () => {
  it("names the object after the file, dropping the last extension", () => {
    const sceneObject = buildSceneObject("id", "Brain Model.glb");

    expect(sceneObject.name).toBe("Brain Model");
  });

  it("builds a scene object with sensible defaults", () => {
    const sceneObject = buildSceneObject("id", "Brain Model.glb");

    expect(sceneObject.inspectableKind).toBe("sceneObject");
    expect(sceneObject.id).toBe("id");
    expect(sceneObject.visibility).toBe("visible");
    expect(sceneObject.lock).toBe(false);
    expect(sceneObject.position).toEqual([0, 0, 0]);
    expect(sceneObject.rotation).toEqual([0, 0, 0]);
    expect(sceneObject.scale).toEqual([1, 1, 1]);
    expect(STANDARD_COLORS).toContain(sceneObject.color);
  });

  it("keeps a dotless file name verbatim", () => {
    const sceneObject = buildSceneObject("id", "BrainModel");

    expect(sceneObject.name).toBe("BrainModel");
  });

  it("keeps a dot-only file name verbatim", () => {
    const sceneObject = buildSceneObject("id", ".gitignore");

    expect(sceneObject.name).toBe(".gitignore");
  });
});

describe("toggleSceneObjectVisibility", () => {
  it("flips visible -> hidden -> visible", () => {
    const sceneObject = makeSceneObject({ visibility: "visible" });

    toggleSceneObjectVisibility(sceneObject);
    expect(sceneObject.visibility).toBe("hidden");

    toggleSceneObjectVisibility(sceneObject);
    expect(sceneObject.visibility).toBe("visible");
  });
});

describe("toggleSceneObjectLock", () => {
  it("flips lock false -> true -> false", () => {
    const sceneObject = makeSceneObject({ lock: false });

    toggleSceneObjectLock(sceneObject);
    expect(sceneObject.lock).toBe(true);

    toggleSceneObjectLock(sceneObject);
    expect(sceneObject.lock).toBe(false);
  });
});

describe("toggleSceneObjectCollidable", () => {
  it("flips collidable true -> false -> true", () => {
    const sceneObject = makeSceneObject({ collidable: true });

    toggleSceneObjectCollidable(sceneObject);
    expect(sceneObject.collidable).toBe(false);

    toggleSceneObjectCollidable(sceneObject);
    expect(sceneObject.collidable).toBe(true);
  });
});

describe("isSceneObject", () => {
  it("accepts a well-formed scene object", () => {
    expect(isSceneObject(makeSceneObject())).toBe(true);
  });

  it("rejects a missing id", () => {
    const { id: _id, ...rest } = makeSceneObject();
    expect(isSceneObject(rest)).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(isSceneObject(makeSceneObject({ id: "" }))).toBe(false);
  });

  it("rejects an invalid color", () => {
    expect(isSceneObject(makeSceneObject({ color: "red" }))).toBe(false);
  });

  it("rejects a shorthand hex color", () => {
    expect(isSceneObject(makeSceneObject({ color: "#fff" }))).toBe(false);
  });

  it("rejects an unknown visibility", () => {
    const sceneObject = {
      ...makeSceneObject(),
      visibility: "shanks"
    };
    expect(isSceneObject(sceneObject)).toBe(false);
  });

  it("rejects a non-boolean lock", () => {
    const sceneObject = { ...makeSceneObject(), lock: "yes" };
    expect(isSceneObject(sceneObject)).toBe(false);
  });

  it("rejects a non-boolean collidable", () => {
    const sceneObject = { ...makeSceneObject(), collidable: "yes" };
    expect(isSceneObject(sceneObject)).toBe(false);
  });

  it("rejects a non-triple position", () => {
    const sceneObject = { ...makeSceneObject(), position: [0, 0] };
    expect(isSceneObject(sceneObject)).toBe(false);
  });

  it("rejects a non-triple scale", () => {
    const sceneObject = { ...makeSceneObject(), scale: [1, 1] };
    expect(isSceneObject(sceneObject)).toBe(false);
  });

  it("rejects a NaN in rotation", () => {
    const sceneObject = {
      ...makeSceneObject(),
      rotation: [0, Number.NaN, 0]
    };
    expect(isSceneObject(sceneObject)).toBe(false);
  });

  it("rejects a probe's inspectableKind", () => {
    const sceneObject = { ...makeSceneObject(), inspectableKind: "probe" };
    expect(isSceneObject(sceneObject)).toBe(false);
  });
});
