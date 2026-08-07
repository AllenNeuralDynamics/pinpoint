import { describe, expect, it } from "vitest";
import {
  millimetersToPositionUnit,
  positionUnitToMillimeters,
  radiansToRotationUnit,
  rotationUnitToRadians
} from "./math";

describe("millimetersToPositionUnit", () => {
  it("converts millimeters to micrometers", () => {
    expect(millimetersToPositionUnit(1, "micrometer")).toBe(1000);
  });

  it("round-trips millimeters unchanged", () => {
    expect(millimetersToPositionUnit(5.4, "millimeter")).toBe(5.4);
  });
});

describe("positionUnitToMillimeters", () => {
  it("converts centimeters to millimeters", () => {
    expect(positionUnitToMillimeters(1, "centimeter")).toBe(10);
  });
});

describe("radiansToRotationUnit", () => {
  it("converts radians to degrees", () => {
    expect(radiansToRotationUnit(Math.PI, "degree")).toBeCloseTo(180);
  });

  it("round-trips radians unchanged", () => {
    expect(radiansToRotationUnit(1.5, "radian")).toBe(1.5);
  });
});

describe("rotationUnitToRadians", () => {
  it("converts degrees to radians", () => {
    expect(rotationUnitToRadians(90, "degree")).toBeCloseTo(Math.PI / 2);
  });
});
