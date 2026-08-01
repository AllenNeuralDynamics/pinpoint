import { describe, expect, it, vi } from "vitest";
import { Color3, StandardMaterial } from "@babylonjs/core";
import { setMaterialAlpha, setMaterialDiffuseColor } from "./material.api";
import { makeTestScene } from "@/test/mount-helper";

describe("setMaterialAlpha", () => {
  it("sets a changed alpha and marks the material dirty", () => {
    const material = new StandardMaterial("material", makeTestScene());
    material.alpha = 1;
    const markDirtySpy = vi.spyOn(material, "markDirty");

    setMaterialAlpha(material, 0.5);

    expect(material.alpha).toBe(0.5);
    expect(markDirtySpy).toHaveBeenCalledWith(true);
  });

  it("does nothing when the alpha is unchanged", () => {
    const material = new StandardMaterial("material", makeTestScene());
    material.alpha = 0.5;
    const markDirtySpy = vi.spyOn(material, "markDirty");

    setMaterialAlpha(material, 0.5);

    expect(markDirtySpy).not.toHaveBeenCalled();
  });

  it("applies a changed alpha to a frozen material and keeps it frozen", () => {
    const material = new StandardMaterial("material", makeTestScene());
    material.alpha = 1;
    material.freeze();

    setMaterialAlpha(material, 0.5);

    expect(material.alpha).toBe(0.5);
    expect(material.isFrozen).toBe(true);
  });

  it("accepts zero as a real alpha change", () => {
    const material = new StandardMaterial("material", makeTestScene());
    material.alpha = 1;

    setMaterialAlpha(material, 0);

    expect(material.alpha).toBe(0);
  });
});

describe("setMaterialDiffuseColor", () => {
  it("sets a changed diffuse color and marks the material dirty", () => {
    const material = new StandardMaterial("material", makeTestScene());
    material.diffuseColor = Color3.FromInts(255, 0, 0);
    const markDirtySpy = vi.spyOn(material, "markDirty");

    setMaterialDiffuseColor(material, Color3.FromInts(0, 255, 0));

    expect(material.diffuseColor.equals(Color3.FromInts(0, 255, 0))).toBe(true);
    expect(markDirtySpy).toHaveBeenCalledWith(true);
  });

  it("does nothing when given a different instance with equal components", () => {
    const material = new StandardMaterial("material", makeTestScene());
    material.diffuseColor = Color3.FromInts(255, 0, 0);
    const markDirtySpy = vi.spyOn(material, "markDirty");

    setMaterialDiffuseColor(material, Color3.FromInts(255, 0, 0));

    expect(markDirtySpy).not.toHaveBeenCalled();
  });

  it("applies a changed diffuse color to a frozen material and keeps it frozen", () => {
    const material = new StandardMaterial("material", makeTestScene());
    material.diffuseColor = Color3.FromInts(255, 0, 0);
    material.freeze();

    setMaterialDiffuseColor(material, Color3.FromInts(0, 255, 0));

    expect(material.diffuseColor.equals(Color3.FromInts(0, 255, 0))).toBe(true);
    expect(material.isFrozen).toBe(true);
  });
});
