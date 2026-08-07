import { describe, expect, it, vi } from "vitest";
import type { Dark } from "quasar";
import { applyAppearance } from "./appearance.api";

/**
 * Build a fake `Dark`-shaped object recording `set` calls, avoiding a jsdom
 * `matchMedia` dependency.
 */
function makeFakeDark(): Dark {
  return {
    isActive: false,
    mode: false,
    set: vi.fn(),
    toggle: vi.fn()
  } as unknown as Dark;
}

describe("applyAppearance", () => {
  it("forces light mode for 'light'", () => {
    const dark = makeFakeDark();

    applyAppearance(dark, "light");

    expect(dark.set).toHaveBeenCalledWith(false);
  });

  it("forces dark mode for 'dark'", () => {
    const dark = makeFakeDark();

    applyAppearance(dark, "dark");

    expect(dark.set).toHaveBeenCalledWith(true);
  });

  it("follows the OS preference for 'auto'", () => {
    const dark = makeFakeDark();

    applyAppearance(dark, "auto");

    expect(dark.set).toHaveBeenCalledWith("auto");
  });
});
