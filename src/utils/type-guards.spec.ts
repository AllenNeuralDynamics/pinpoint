import { describe, expect, it } from "vitest";
import {
  isFiniteNumber,
  isFiniteTriple,
  isHexColor,
  isRecord,
  isSafeObjectKey
} from "./type-guards";

describe("isRecord", () => {
  it("accepts a plain object", () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("rejects an array", () => {
    expect(isRecord([1, 2])).toBe(false);
  });

  it("rejects null", () => {
    expect(isRecord(null)).toBe(false);
  });
});

describe("isFiniteNumber", () => {
  it("accepts a finite number", () => {
    expect(isFiniteNumber(1.5)).toBe(true);
  });

  it("rejects NaN and Infinity", () => {
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
  });

  it("rejects a non-number", () => {
    expect(isFiniteNumber("1")).toBe(false);
  });
});

describe("isFiniteTriple", () => {
  it("accepts a tuple of three finite numbers", () => {
    expect(isFiniteTriple([1, 2, 3])).toBe(true);
  });

  it("rejects a tuple of the wrong length", () => {
    expect(isFiniteTriple([1, 2])).toBe(false);
  });

  it("rejects a tuple containing a non-finite number", () => {
    expect(isFiniteTriple([1, NaN, 3])).toBe(false);
  });
});

describe("isHexColor", () => {
  it("accepts a #RRGGBB string", () => {
    expect(isHexColor("#a1b2c3")).toBe(true);
  });

  it("rejects a short hex string", () => {
    expect(isHexColor("#abc")).toBe(false);
  });
});

describe("isSafeObjectKey", () => {
  it("accepts an ordinary key", () => {
    expect(isSafeObjectKey("coordinate-system-1")).toBe(true);
  });

  it("rejects __proto__, constructor, and prototype", () => {
    expect(isSafeObjectKey("__proto__")).toBe(false);
    expect(isSafeObjectKey("constructor")).toBe(false);
    expect(isSafeObjectKey("prototype")).toBe(false);
  });
});
