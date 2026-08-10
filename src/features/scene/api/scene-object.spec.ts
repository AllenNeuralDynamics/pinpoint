import { describe, expect, it } from "vitest";
import {
  buildSceneObject,
  copySceneObject,
  isSceneObject,
  toggleSceneObjectCollidable,
  toggleSceneObjectLock,
  toggleSceneObjectVisibility
} from "./scene-object.api";
import { STANDARD_COLORS } from "../models/standard-colors.model";
import { addSceneObject, buildExperiment } from "@/features/experiment";
import { makeAtlas, makeSceneObject } from "@/test/fixtures";

describe("buildSceneObject", () => {
  it("names the object after the file, dropping the last extension", () => {
    const sceneObject = buildSceneObject("id", "Brain Model.glb");

    expect(sceneObject.name).toBe("Brain Model");
  });

  it("builds a scene object with sensible defaults", () => {
    const sceneObject = buildSceneObject("id", "Brain Model.glb");

    expect(sceneObject.inspectableKind).toBe("sceneObject");
    expect(sceneObject.modelId).toBe("id");
    expect(typeof sceneObject.id).toBe("string");
    expect(sceneObject.id.length).toBeGreaterThan(0);
    expect(sceneObject.id).not.toBe("id");
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

describe("copySceneObject", () => {
  it("inserts the copy directly after the source, with a fresh id and a copy-suffixed name", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const a = makeSceneObject({ name: "A" });
    const b = makeSceneObject({ name: "B" });
    addSceneObject(experiment, a);
    addSceneObject(experiment, b);

    const copy = copySceneObject(experiment, a);

    expect(experiment.sceneObjects).toHaveLength(3);
    expect(experiment.sceneObjects[1]).toBe(copy);
    expect(copy!.id).not.toBe(a.id);
    expect(copy!.name).toBe("A - copy");
    expect(copy).toEqual({ ...a, id: copy!.id, name: copy!.name });
  });

  it("shares the source's stored model file", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const a = makeSceneObject();
    addSceneObject(experiment, a);

    const copy = copySceneObject(experiment, a);

    expect(copy!.modelId).toBe(a.modelId);
  });

  it("returns null and leaves the experiment untouched when the object isn't there", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);

    const copy = copySceneObject(experiment, makeSceneObject());

    expect(copy).toBeNull();
    expect(experiment.sceneObjects).toEqual([]);
  });

  it("copies a locked source as locked", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const sceneObject = makeSceneObject({ lock: true });
    addSceneObject(experiment, sceneObject);

    const copy = copySceneObject(experiment, sceneObject);

    expect(copy!.lock).toBe(true);
  });

  it("deep-copies mutable fields, independent of the source", () => {
    const experiment = buildExperiment("experiment", makeAtlas(), [0, 0, 0]);
    const sceneObject = makeSceneObject({ position: [1, 2, 3] });
    addSceneObject(experiment, sceneObject);

    const copy = copySceneObject(experiment, sceneObject)!;
    copy.position[0] = 99;

    expect(sceneObject.position[0]).toBe(1);
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

  it("rejects an invalid color", () => {
    expect(isSceneObject(makeSceneObject({ color: "red" }))).toBe(false);
  });

  it("rejects a shorthand hex color", () => {
    expect(isSceneObject(makeSceneObject({ color: "#fff" }))).toBe(false);
  });

  it("rejects a missing id", () => {
    const { id: _id, ...rest } = makeSceneObject();
    expect(isSceneObject(rest)).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(isSceneObject(makeSceneObject({ id: "" }))).toBe(false);
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

  it("rejects a probe's inspectableKind", () => {
    const sceneObject = { ...makeSceneObject(), inspectableKind: "probe" };
    expect(isSceneObject(sceneObject)).toBe(false);
  });
});
