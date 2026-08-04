import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import type { ValidationRule } from "quasar";
import enUS from "@/i18n/en-US";
import { mountWithQuasar } from "@/test/mount-helper";
import { useValidationRules } from "./useValidationRules";

/** A rule function, never one of Quasar's embedded preset names. */
type RuleFn = (value: string) => boolean | string;

/**
 * Narrow a rule list's first entry to a callable function.
 * @param rules Rule list to read the first entry of.
 */
function firstRule(rules: ValidationRule<string>[]): RuleFn {
  const rule = rules[0]!;
  if (typeof rule === "string") throw new Error("expected a function rule");
  return rule as RuleFn;
}

/**
 * Mount a throwaway component so `useValidationRules`' `useI18n` call has a
 * real component setup context, backed by the app's actual en-US messages.
 */
function mountValidationRules() {
  let rules!: ReturnType<typeof useValidationRules>;
  mountWithQuasar(
    defineComponent({
      setup() {
        rules = useValidationRules();
        return () => null;
      }
    })
  );
  return rules;
}

describe("useValidationRules", () => {
  describe("requiredName", () => {
    it("fails for an empty string", () => {
      const rule = firstRule(mountValidationRules().requiredName);

      expect(rule("")).toBe(enUS.validation.nameRequired);
    });

    it("fails for a whitespace-only string", () => {
      const rule = firstRule(mountValidationRules().requiredName);

      expect(rule("   ")).toBe(enUS.validation.nameRequired);
    });

    it("passes for a non-blank string", () => {
      const rule = firstRule(mountValidationRules().requiredName);

      expect(rule("Probe A")).toBe(true);
    });
  });

  describe("optionalNumber", () => {
    it("passes for an empty string", () => {
      const rule = firstRule(mountValidationRules().optionalNumber);

      expect(rule("")).toBe(true);
    });

    it("passes for a whitespace-only string", () => {
      const rule = firstRule(mountValidationRules().optionalNumber);

      expect(rule("   ")).toBe(true);
    });

    it("passes for a numeric string", () => {
      const rule = firstRule(mountValidationRules().optionalNumber);

      expect(rule("42.5")).toBe(true);
    });

    it("fails for a non-numeric string", () => {
      const rule = firstRule(mountValidationRules().optionalNumber);

      expect(rule("abc")).toBe(enUS.validation.mustBeNumber);
    });
  });
});
