import type { Dark } from "quasar";

/** Theme the app renders with; `auto` follows the OS preference. */
export type Appearance = "light" | "dark" | "auto";

/**
 * Apply an appearance preference to Quasar's dark mode.
 * @param dark Quasar dark-mode plugin to drive.
 * @param appearance Appearance preference to apply.
 */
export function applyAppearance(dark: Dark, appearance: Appearance): void {
  dark.set(appearance === "auto" ? "auto" : appearance === "dark");
}
