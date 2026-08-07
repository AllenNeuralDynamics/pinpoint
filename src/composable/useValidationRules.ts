import type { ValidationRule } from "quasar";
import { useI18n } from "vue-i18n";

/**
 * Quasar validation rules for a required name, an optional numeric field,
 * and a required positive numeric field.
 */
export function useValidationRules(): {
  requiredName: ValidationRule<string>[];
  optionalNumber: ValidationRule<string>[];
  positiveNumber: ValidationRule<string>[];
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
    ],
    positiveNumber: [
      value =>
        (Number.isFinite(Number(value)) && Number(value) > 0) ||
        t("validation.mustBePositiveNumber")
    ]
  };
}
