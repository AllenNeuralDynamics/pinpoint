import { createI18n } from "vue-i18n";
import messages from "@/i18n";

export type MessageLanguages = keyof typeof messages;
export type MessageSchema = (typeof messages)["en-US"];

// See https://vue-i18n.intlify.dev/guide/advanced/typescript.html#global-resource-schema-type-definition
/* eslint-disable typescript/no-empty-object-type */
declare module "vue-i18n" {
  export interface DefineLocaleMessage extends MessageSchema {}
  export interface DefineDateTimeFormat {}
  export interface DefineNumberFormat {}
}
/* eslint-enable typescript/no-empty-object-type */

/**
 * Global vue-i18n instance, usable outside components via `i18n.global`.
 */
export const i18n = createI18n<{ message: MessageSchema }, MessageLanguages>({
  locale: "en-US",
  legacy: false,
  messages
});
