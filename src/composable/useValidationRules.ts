import type { ValidationRule } from "quasar";
import { useI18n } from "vue-i18n";

/**
 * Quasar validation rules for a required name and an optional numeric field.
 */
export function useValidationRules(): {
  requiredName: ValidationRule<string>[];
  optionalNumber: ValidationRule<string>[];
} {
  const { t } = useI18n();

  return {
    requiredName: [
      value => value.trim().length > 0 || t("validation.nameRequired")
    ],
    optionalNumber: [
      value =>
        value.trim().length === 0 ||
        Number.isFinite(Number(value)) ||
        t("validation.mustBeNumber")
    ]
  };
}
